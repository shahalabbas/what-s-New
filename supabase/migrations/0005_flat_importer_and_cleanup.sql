-- ═══════════════════════════════════════════════════════════════════
-- Migration 0005: Flat Table Timetable Schema, Course Progress View, Cleanup
-- ═══════════════════════════════════════════════════════════════════

-- 1. Create `terms` Table
CREATE TABLE IF NOT EXISTS public.terms (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  term_key        TEXT NOT NULL,
  program         TEXT NOT NULL DEFAULT 'dem',
  batch_year      INTEGER NOT NULL DEFAULT 2026,
  term_name       TEXT NOT NULL,
  start_date      DATE NOT NULL,
  end_date        DATE NOT NULL,
  default_venue   TEXT,
  updated_as_on   DATE,
  source_batch_id UUID REFERENCES public.ingest_batches(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_terms_cohort_key UNIQUE (program, batch_year, term_key),
  CONSTRAINT chk_term_dates CHECK (end_date >= start_date)
);

CREATE INDEX IF NOT EXISTS idx_terms_cohort ON public.terms(program, batch_year);

-- Enable RLS on terms
ALTER TABLE public.terms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read terms for their cohort"
  ON public.terms FOR SELECT
  TO authenticated
  USING (
    program = (SELECT program FROM public.profiles WHERE id = auth.uid())
    AND batch_year = (SELECT batch_year FROM public.profiles WHERE id = auth.uid())
  );

CREATE POLICY "Admins can manage terms for their cohort"
  ON public.terms FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role = 'admin'
        AND program = public.terms.program
        AND batch_year = public.terms.batch_year
    )
  );

-- 2. Update `courses` Table
ALTER TABLE public.courses
  DROP CONSTRAINT IF EXISTS courses_code_key;

ALTER TABLE public.courses
  ADD COLUMN IF NOT EXISTS grid_label TEXT,
  ADD COLUMN IF NOT EXISTS credits NUMERIC NOT NULL DEFAULT 4,
  ADD COLUMN IF NOT EXISTS total_sessions INTEGER;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_courses_cohort_code'
  ) THEN
    ALTER TABLE public.courses
      ADD CONSTRAINT uq_courses_cohort_code UNIQUE (program, batch_year, code);
  END IF;
END $$;

ALTER TABLE public.class_sessions
  ADD COLUMN IF NOT EXISTS session_no INTEGER,
  ADD COLUMN IF NOT EXISTS term_id UUID REFERENCES public.terms(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS raw_text TEXT;

-- Ensure default term exists for existing sessions
DO $$
DECLARE
  default_term_id UUID;
BEGIN
  INSERT INTO public.terms (term_key, program, batch_year, term_name, start_date, end_date, default_venue)
  VALUES ('term3_2026', 'dem', 2026, 'Term-III', '2026-09-21', '2026-12-19', 'CR-7C-15')
  ON CONFLICT (program, batch_year, term_key) DO UPDATE SET term_name = EXCLUDED.term_name
  RETURNING id INTO default_term_id;

  IF default_term_id IS NULL THEN
    SELECT id INTO default_term_id FROM public.terms WHERE program = 'dem' AND batch_year = 2026 AND term_key = 'term3_2026';
  END IF;

  UPDATE public.class_sessions SET term_id = default_term_id WHERE term_id IS NULL;
END $$;

-- 4. Update `events` Table
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS date DATE,
  ADD COLUMN IF NOT EXISTS all_day BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS course_id UUID REFERENCES public.courses(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'cancelled', 'rescheduled')),
  ADD COLUMN IF NOT EXISTS term_id UUID REFERENCES public.terms(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS source_batch_id UUID REFERENCES public.ingest_batches(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS raw_text TEXT,
  ADD COLUMN IF NOT EXISTS note TEXT;

ALTER TABLE public.events
  DROP CONSTRAINT IF EXISTS events_type_check;

ALTER TABLE public.events
  ADD CONSTRAINT events_type_check
  CHECK (type IN (
    'exam', 'quiz', 'holiday', 'campus_event', 'industry_talk',
    'workshop', 'placement', 'assignment', 'doubt_session',
    'guest_session', 'event', 'meeting', 'notice', 'placement_event'
  ));

-- Move any legacy exam/other sessions into events before restricting constraint
INSERT INTO public.events (program, batch_year, type, title, start_at, end_at, date, all_day, venue, source_batch_id, note)
SELECT
  cs.program,
  cs.batch_year,
  CASE WHEN cs.session_type = 'exam' THEN 'exam' ELSE 'campus_event' END,
  COALESCE(c.name, cs.note, 'Academic Event'),
  (cs.date || 'T' || cs.start_time || '+05:30')::TIMESTAMPTZ,
  (cs.date || 'T' || cs.end_time || '+05:30')::TIMESTAMPTZ,
  cs.date,
  false,
  cs.room,
  cs.source_batch_id,
  cs.note
FROM public.class_sessions cs
LEFT JOIN public.courses c ON c.id = cs.course_id
WHERE cs.session_type NOT IN ('lecture', 'tutorial')
ON CONFLICT DO NOTHING;

DELETE FROM public.class_sessions WHERE session_type NOT IN ('lecture', 'tutorial');

ALTER TABLE public.class_sessions
  DROP CONSTRAINT IF EXISTS class_sessions_session_type_check;

ALTER TABLE public.class_sessions
  ADD CONSTRAINT class_sessions_session_type_check
  CHECK (session_type IN ('lecture', 'tutorial'));

ALTER TABLE public.class_sessions
  DROP CONSTRAINT IF EXISTS class_sessions_status_check;

ALTER TABLE public.class_sessions
  ADD CONSTRAINT class_sessions_status_check
  CHECK (status IN ('scheduled', 'cancelled', 'rescheduled'));

-- Partial unique index: one active session number per course
CREATE UNIQUE INDEX IF NOT EXISTS uq_course_session_no_active
  ON public.class_sessions (course_id, session_no)
  WHERE status <> 'cancelled' AND session_no IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_class_sessions_cohort_date
  ON public.class_sessions (program, batch_year, date);

-- Backfill date from start_at where missing
UPDATE public.events
SET date = (start_at AT TIME ZONE 'Asia/Kolkata')::DATE
WHERE date IS NULL AND start_at IS NOT NULL;

ALTER TABLE public.events
  ALTER COLUMN start_at DROP NOT NULL;

ALTER TABLE public.events
  DROP CONSTRAINT IF EXISTS chk_event_timing;

ALTER TABLE public.events
  ADD CONSTRAINT chk_event_timing
  CHECK (all_day = true OR start_at IS NOT NULL);

CREATE INDEX IF NOT EXISTS idx_events_cohort_date
  ON public.events (program, batch_year, date);

-- 5. Update `mess_menu`
ALTER TABLE public.mess_menu
  ADD COLUMN IF NOT EXISTS source_batch_id UUID REFERENCES public.ingest_batches(id) ON DELETE SET NULL;

-- 6. Create `course_progress` View (Security Invoker)
CREATE OR REPLACE VIEW public.course_progress
WITH (security_invoker = true) AS
WITH session_counts AS (
  SELECT
    cs.course_id,
    COUNT(DISTINCT cs.session_no) FILTER (
      WHERE cs.status <> 'cancelled'
        AND cs.session_no IS NOT NULL
        AND (cs.date + cs.end_time) < (NOW() AT TIME ZONE 'Asia/Kolkata')
    ) AS held_sessions,
    COUNT(DISTINCT cs.session_no) FILTER (
      WHERE cs.status <> 'cancelled'
        AND cs.session_no IS NOT NULL
    ) AS scheduled_sessions,
    MIN(cs.date) FILTER (
      WHERE cs.status <> 'cancelled'
        AND (cs.date + cs.start_time) >= (NOW() AT TIME ZONE 'Asia/Kolkata')
    ) AS next_session_date,
    MIN(cs.session_no) FILTER (
      WHERE cs.status <> 'cancelled'
        AND (cs.date + cs.start_time) >= (NOW() AT TIME ZONE 'Asia/Kolkata')
    ) AS next_session_no
  FROM public.class_sessions cs
  WHERE cs.course_id IS NOT NULL
  GROUP BY cs.course_id
),
exam_dates AS (
  SELECT
    e.course_id,
    MIN(e.date) AS exam_date
  FROM public.events e
  WHERE e.course_id IS NOT NULL
    AND e.type = 'exam'
    AND e.status <> 'cancelled'
  GROUP BY e.course_id
)
SELECT
  c.id AS course_id,
  c.program,
  c.batch_year,
  c.code AS course_code,
  c.name AS course_name,
  c.faculty,
  c.color_tag,
  c.credits,
  COALESCE(c.total_sessions, (c.credits * 5)::INT) AS total_sessions,
  COALESCE(sc.held_sessions, 0) AS completed_sessions,
  COALESCE(sc.scheduled_sessions, 0) AS scheduled_sessions,
  GREATEST(0, COALESCE(c.total_sessions, (c.credits * 5)::INT) - COALESCE(sc.held_sessions, 0)) AS remaining_sessions,
  CASE
    WHEN COALESCE(c.total_sessions, (c.credits * 5)::INT) > 0 THEN
      ROUND((COALESCE(sc.held_sessions, 0)::NUMERIC / COALESCE(c.total_sessions, (c.credits * 5)::INT)::NUMERIC) * 100, 1)
    ELSE 0
  END AS percent_complete,
  sc.next_session_date,
  sc.next_session_no,
  ed.exam_date
FROM public.courses c
JOIN session_counts sc ON sc.course_id = c.id
LEFT JOIN exam_dates ed ON ed.course_id = c.id
WHERE COALESCE(sc.scheduled_sessions, 0) > 0;

-- 7. Drop Obsolete Legacy Tables & Functions
DROP TABLE IF EXISTS public.timetable_overrides CASCADE;
DROP TABLE IF EXISTS public.timetable_slots CASCADE;
DROP TABLE IF EXISTS public.mapping_templates CASCADE;
