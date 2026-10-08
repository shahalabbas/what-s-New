-- ═══════════════════════════════════════════════════════════════════
-- Migration 0004: Data Ingestion Pipeline & Dated Class Sessions
-- Free Plan Auth Trigger, Ingest Batches/Items, Events, Rollback, RLS
-- ═══════════════════════════════════════════════════════════════════

-- ─── 0. Free-Plan Auth Gate Trigger on auth.users ─────────────────
CREATE OR REPLACE FUNCTION public.validate_user_signup()
RETURNS TRIGGER AS $$
DECLARE
  user_email TEXT;
  parsed_prog TEXT;
  parsed_year INTEGER;
  email_valid BOOLEAN;
  cohort_active BOOLEAN;
  is_admin_email BOOLEAN;
BEGIN
  user_email := lower(trim(NEW.email));

  -- 1. Domain Check
  IF user_email IS NULL OR NOT user_email LIKE '%@iimu.ac.in' THEN
    RAISE EXCEPTION 'Access denied: This app is only available to IIM Udaipur accounts (@iimu.ac.in).';
  END IF;

  -- 2. Admin Check
  SELECT EXISTS (
    SELECT 1 FROM public.admin_emails WHERE lower(email) = user_email
  ) INTO is_admin_email;

  IF is_admin_email THEN
    RETURN NEW;
  END IF;

  -- 3. Regex & Cohort Check
  SELECT p.program, p.batch_year, p.is_valid
  INTO parsed_prog, parsed_year, email_valid
  FROM public.parse_iimu_email(user_email) p;

  IF NOT email_valid THEN
    RAISE EXCEPTION 'Access denied: Invalid student email format. Must be <name>.<program><year>@iimu.ac.in';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.allowed_cohorts
    WHERE lower(program) = parsed_prog
      AND batch_year = parsed_year
      AND is_active = true
  ) INTO cohort_active;

  IF NOT cohort_active THEN
    RAISE EXCEPTION 'Access denied: This app is currently available only to DEM 2026 students.';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS tr_validate_user_signup ON auth.users;
CREATE TRIGGER tr_validate_user_signup
  BEFORE INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.validate_user_signup();

-- ─── 1. Ingestion Batches & Items ─────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ingest_batches (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind        TEXT NOT NULL CHECK (kind IN ('timetable', 'mess', 'email')),
  source      TEXT NOT NULL CHECK (source IN ('upload', 'paste', 'gmail')),
  file_path   TEXT,
  status      TEXT NOT NULL DEFAULT 'pending_review'
              CHECK (status IN ('pending_review', 'applied', 'rejected', 'rolled_back', 'failed')),
  created_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  applied_at  TIMESTAMPTZ,
  summary     JSONB DEFAULT '{}'::jsonb,
  snapshot    JSONB DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS public.ingest_items (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id    UUID REFERENCES public.ingest_batches(id) ON DELETE CASCADE,
  message_id  TEXT UNIQUE,
  raw_text    TEXT NOT NULL,
  raw_meta    JSONB DEFAULT '{}'::jsonb,
  prefill     JSONB DEFAULT '{}'::jsonb,
  item_type   TEXT NOT NULL DEFAULT 'notice'
              CHECK (item_type IN ('assignment', 'project', 'placement_event', 'meeting', 'notice', 'other')),
  status      TEXT NOT NULL DEFAULT 'pending'
              CHECK (status IN ('pending', 'approved', 'rejected')),
  error       TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ─── 2. Dated class_sessions Table ────────────────────────────────
CREATE TABLE IF NOT EXISTS public.class_sessions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  program          TEXT NOT NULL DEFAULT 'dem',
  batch_year       INTEGER NOT NULL DEFAULT 2026,
  date             DATE NOT NULL,
  start_time       TIME NOT NULL,
  end_time         TIME NOT NULL,
  course_id        UUID REFERENCES public.courses(id) ON DELETE SET NULL,
  faculty          TEXT,
  room             TEXT,
  session_type     TEXT NOT NULL DEFAULT 'lecture'
                   CHECK (session_type IN ('lecture', 'tutorial', 'exam', 'other')),
  status           TEXT NOT NULL DEFAULT 'scheduled'
                   CHECK (status IN ('scheduled', 'cancelled', 'rescheduled')),
  note             TEXT,
  source_batch_id  UUID REFERENCES public.ingest_batches(id) ON DELETE SET NULL,
  updated_by       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at       TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT chk_session_times CHECK (end_time > start_time)
);

CREATE INDEX IF NOT EXISTS idx_class_sessions_date ON public.class_sessions(date, program, batch_year);

-- ─── 3. Events Table (Placements, Meetings, Notices) ──────────────
CREATE TABLE IF NOT EXISTS public.events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  program         TEXT NOT NULL DEFAULT 'dem',
  batch_year      INTEGER NOT NULL DEFAULT 2026,
  type            TEXT NOT NULL CHECK (type IN ('placement_event', 'meeting', 'notice')),
  title           TEXT NOT NULL,
  description     TEXT,
  start_at        TIMESTAMPTZ NOT NULL,
  end_at          TIMESTAMPTZ,
  venue           TEXT,
  link            TEXT,
  company         TEXT,
  source_item_id  UUID REFERENCES public.ingest_items(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_events_start ON public.events(start_at, program, batch_year);

-- Add source tracking columns to existing tables
ALTER TABLE public.mess_menu
  ADD COLUMN IF NOT EXISTS source_batch_id UUID REFERENCES public.ingest_batches(id) ON DELETE SET NULL;

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS source_item_id UUID REFERENCES public.ingest_items(id) ON DELETE SET NULL;

-- ─── 4. Data Migration: Populate class_sessions from slots & overrides ───
DO $$
DECLARE
  curr_date DATE;
  term_start DATE := '2026-10-01';
  term_end   DATE := '2026-12-31';
  slot RECORD;
  override RECORD;
BEGIN
  curr_date := term_start;
  WHILE curr_date <= term_end LOOP
    FOR slot IN
      SELECT s.*, c.faculty as default_faculty
      FROM public.timetable_slots s
      LEFT JOIN public.courses c ON c.id = s.course_id
      WHERE s.day_of_week = EXTRACT(DOW FROM curr_date)
    LOOP
      SELECT * INTO override
      FROM public.timetable_overrides
      WHERE (slot_id = slot.id OR (course_id = slot.course_id AND date = curr_date))
        AND date = curr_date
      LIMIT 1;

      IF override.id IS NOT NULL THEN
        IF override.action = 'cancelled' THEN
          INSERT INTO public.class_sessions (program, batch_year, date, start_time, end_time, course_id, faculty, room, session_type, status, note)
          VALUES (slot.program, slot.batch_year, curr_date, slot.start_time, slot.end_time, slot.course_id, slot.default_faculty, slot.room, slot.session_type, 'cancelled', override.note);
        ELSIF override.action = 'rescheduled' THEN
          INSERT INTO public.class_sessions (program, batch_year, date, start_time, end_time, course_id, faculty, room, session_type, status, note)
          VALUES (slot.program, slot.batch_year, curr_date, COALESCE(override.new_start, slot.start_time), COALESCE(override.new_end, slot.end_time), slot.course_id, slot.default_faculty, COALESCE(override.new_room, slot.room), slot.session_type, 'rescheduled', override.note);
        END IF;
      ELSE
        INSERT INTO public.class_sessions (program, batch_year, date, start_time, end_time, course_id, faculty, room, session_type, status)
        VALUES (slot.program, slot.batch_year, curr_date, slot.start_time, slot.end_time, slot.course_id, slot.default_faculty, slot.room, slot.session_type, 'scheduled');
      END IF;
    END LOOP;

    -- Extra sessions
    FOR override IN
      SELECT o.*, c.faculty as default_faculty
      FROM public.timetable_overrides o
      LEFT JOIN public.courses c ON c.id = o.course_id
      WHERE o.date = curr_date AND o.action = 'extra'
    LOOP
      INSERT INTO public.class_sessions (program, batch_year, date, start_time, end_time, course_id, faculty, room, session_type, status, note)
      VALUES (COALESCE(override.program, 'dem'), COALESCE(override.batch_year, 2026), curr_date, COALESCE(override.new_start, '09:00'), COALESCE(override.new_end, '10:30'), override.course_id, override.default_faculty, override.new_room, 'lecture', 'scheduled', override.note);
    END LOOP;

    curr_date := curr_date + INTERVAL '1 day';
  END LOOP;
END $$;

-- ─── 5. Transactional Apply & Rollback Functions ───────────────────
CREATE OR REPLACE FUNCTION public.apply_timetable_batch(
  p_batch_id UUID,
  p_program TEXT,
  p_batch_year INTEGER,
  p_sessions JSONB
)
RETURNS JSONB AS $$
DECLARE
  v_min_date DATE;
  v_max_date DATE;
  v_old_sessions JSONB;
BEGIN
  -- Extract affected date range
  SELECT MIN((value->>'date')::DATE), MAX((value->>'date')::DATE)
  INTO v_min_date, v_max_date
  FROM jsonb_array_elements(p_sessions);

  -- 1. Snapshot existing rows for rollback
  SELECT jsonb_agg(to_jsonb(cs))
  INTO v_old_sessions
  FROM public.class_sessions cs
  WHERE cs.program = p_program
    AND cs.batch_year = p_batch_year
    AND cs.date BETWEEN v_min_date AND v_max_date;

  -- 2. Delete existing rows in range
  DELETE FROM public.class_sessions
  WHERE program = p_program
    AND batch_year = p_batch_year
    AND date BETWEEN v_min_date AND v_max_date;

  -- 3. Insert new sessions
  INSERT INTO public.class_sessions (
    program, batch_year, date, start_time, end_time, course_id, faculty, room, session_type, status, note, source_batch_id, updated_by
  )
  SELECT
    p_program,
    p_batch_year,
    (value->>'date')::DATE,
    (value->>'start_time')::TIME,
    (value->>'end_time')::TIME,
    (value->>'course_id')::UUID,
    value->>'faculty',
    value->>'room',
    COALESCE(value->>'session_type', 'lecture'),
    COALESCE(value->>'status', 'scheduled'),
    value->>'note',
    p_batch_id,
    auth.uid()
  FROM jsonb_array_elements(p_sessions);

  -- 4. Mark batch applied with snapshot
  UPDATE public.ingest_batches
  SET
    status = 'applied',
    applied_at = NOW(),
    snapshot = jsonb_build_object(
      'min_date', v_min_date,
      'max_date', v_max_date,
      'previous_rows', COALESCE(v_old_sessions, '[]'::jsonb)
    )
  WHERE id = p_batch_id;

  RETURN jsonb_build_object('success', true, 'count', jsonb_array_length(p_sessions));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.apply_mess_batch(
  p_batch_id UUID,
  p_menu_entries JSONB
)
RETURNS JSONB AS $$
DECLARE
  v_min_date DATE;
  v_max_date DATE;
  v_old_menu JSONB;
BEGIN
  SELECT MIN((value->>'date')::DATE), MAX((value->>'date')::DATE)
  INTO v_min_date, v_max_date
  FROM jsonb_array_elements(p_menu_entries);

  SELECT jsonb_agg(to_jsonb(mm))
  INTO v_old_menu
  FROM public.mess_menu mm
  WHERE mm.date BETWEEN v_min_date AND v_max_date;

  DELETE FROM public.mess_menu
  WHERE date BETWEEN v_min_date AND v_max_date;

  INSERT INTO public.mess_menu (date, meal, items, start_time, end_time, source_batch_id)
  SELECT
    (value->>'date')::DATE,
    value->>'meal',
    ARRAY(SELECT jsonb_array_elements_text(value->'items')),
    (value->>'start_time')::TIME,
    (value->>'end_time')::TIME,
    p_batch_id
  FROM jsonb_array_elements(p_menu_entries);

  UPDATE public.ingest_batches
  SET
    status = 'applied',
    applied_at = NOW(),
    snapshot = jsonb_build_object(
      'min_date', v_min_date,
      'max_date', v_max_date,
      'previous_rows', COALESCE(v_old_menu, '[]'::jsonb)
    )
  WHERE id = p_batch_id;

  RETURN jsonb_build_object('success', true, 'count', jsonb_array_length(p_menu_entries));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.rollback_ingest_batch(p_batch_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_batch RECORD;
  v_prev_rows JSONB;
BEGIN
  SELECT * INTO v_batch FROM public.ingest_batches WHERE id = p_batch_id;
  IF v_batch.id IS NULL THEN
    RAISE EXCEPTION 'Batch not found';
  END IF;

  IF v_batch.status != 'applied' THEN
    RAISE EXCEPTION 'Batch is not in applied state';
  END IF;

  v_prev_rows := v_batch.snapshot->'previous_rows';

  IF v_batch.kind = 'timetable' THEN
    DELETE FROM public.class_sessions WHERE source_batch_id = p_batch_id;
    IF v_prev_rows IS NOT NULL AND jsonb_array_length(v_prev_rows) > 0 THEN
      INSERT INTO public.class_sessions
      SELECT * FROM jsonb_populate_recordset(null::public.class_sessions, v_prev_rows);
    END IF;
  ELSIF v_batch.kind = 'mess' THEN
    DELETE FROM public.mess_menu WHERE source_batch_id = p_batch_id;
    IF v_prev_rows IS NOT NULL AND jsonb_array_length(v_prev_rows) > 0 THEN
      INSERT INTO public.mess_menu
      SELECT * FROM jsonb_populate_recordset(null::public.mess_menu, v_prev_rows);
    END IF;
  END IF;

  UPDATE public.ingest_batches SET status = 'rolled_back' WHERE id = p_batch_id;
  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─── 6. Row Level Security Policies ───────────────────────────────
ALTER TABLE public.class_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ingest_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ingest_items ENABLE ROW LEVEL SECURITY;

-- class_sessions RLS
DROP POLICY IF EXISTS "class_sessions_select_cohort" ON public.class_sessions;
CREATE POLICY "class_sessions_select_cohort" ON public.class_sessions
  FOR SELECT USING (
    (program, batch_year) = (
      SELECT p.program, p.batch_year FROM public.get_current_profile() p
    )
  );

DROP POLICY IF EXISTS "class_sessions_admin_all" ON public.class_sessions;
CREATE POLICY "class_sessions_admin_all" ON public.class_sessions
  FOR ALL USING (
    public.is_admin() AND
    (program, batch_year) = (
      SELECT p.program, p.batch_year FROM public.get_current_profile() p
    )
  );

-- events RLS
DROP POLICY IF EXISTS "events_select_cohort" ON public.events;
CREATE POLICY "events_select_cohort" ON public.events
  FOR SELECT USING (
    (program, batch_year) = (
      SELECT p.program, p.batch_year FROM public.get_current_profile() p
    )
  );

DROP POLICY IF EXISTS "events_admin_all" ON public.events;
CREATE POLICY "events_admin_all" ON public.events
  FOR ALL USING (
    public.is_admin() AND
    (program, batch_year) = (
      SELECT p.program, p.batch_year FROM public.get_current_profile() p
    )
  );

-- ingest_batches RLS (admin only)
DROP POLICY IF EXISTS "ingest_batches_admin_all" ON public.ingest_batches;
CREATE POLICY "ingest_batches_admin_all" ON public.ingest_batches
  FOR ALL USING (public.is_admin());

-- ingest_items RLS (admin only)
DROP POLICY IF EXISTS "ingest_items_admin_all" ON public.ingest_items;
CREATE POLICY "ingest_items_admin_all" ON public.ingest_items
  FOR ALL USING (public.is_admin());

-- ─── 7. Ingestion Storage Bucket Setup ────────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('ingest', 'ingest', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "ingest_bucket_admin" ON storage.objects;
CREATE POLICY "ingest_bucket_admin" ON storage.objects
  FOR ALL USING (
    bucket_id = 'ingest' AND public.is_admin()
  );
