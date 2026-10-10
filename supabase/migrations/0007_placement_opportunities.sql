-- ═══════════════════════════════════════════════════════════════════
-- Migration 0007: Placement Opportunities (Stage, Additional Details, Updates & Applications)
-- ═══════════════════════════════════════════════════════════════════

-- 1. Create placement_opportunities table if not exists
CREATE TABLE IF NOT EXISTS public.placement_opportunities (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  program             TEXT NOT NULL DEFAULT 'dem',
  batch_year          INTEGER NOT NULL DEFAULT 2026,
  source              TEXT NOT NULL DEFAULT 'superset' CHECK (source IN ('superset', 'manual')),
  external_job_id     TEXT,
  company             TEXT NOT NULL,
  role                TEXT NOT NULL,
  stage               TEXT NOT NULL DEFAULT 'open_for_application'
                      CHECK (stage IN (
                        'open_for_application',
                        'deadline_extended',
                        'application_closed',
                        'shortlist',
                        'test',
                        'group_discussion',
                        'interview',
                        'result',
                        'pre_placement_talk',
                        'other'
                      )),
  deadline_at         TIMESTAMPTZ,
  application_start   TIMESTAMPTZ,
  event_at            TIMESTAMPTZ,
  venue_or_link       TEXT,
  apply_url           TEXT,
  additional_details  JSONB NOT NULL DEFAULT '[]'::jsonb,
  notes               TEXT,
  message_id          TEXT,
  created_by          UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Migrate existing columns / schema alterations if table previously existed
DO $$
BEGIN
  -- Add stage if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'placement_opportunities' AND column_name = 'stage'
  ) THEN
    ALTER TABLE public.placement_opportunities 
      ADD COLUMN stage TEXT NOT NULL DEFAULT 'open_for_application'
      CHECK (stage IN (
        'open_for_application',
        'deadline_extended',
        'application_closed',
        'shortlist',
        'test',
        'group_discussion',
        'interview',
        'result',
        'pre_placement_talk',
        'other'
      ));
  END IF;

  -- Add additional_details if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'placement_opportunities' AND column_name = 'additional_details'
  ) THEN
    ALTER TABLE public.placement_opportunities 
      ADD COLUMN additional_details JSONB NOT NULL DEFAULT '[]'::jsonb;
  END IF;

  -- Add application_start if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'placement_opportunities' AND column_name = 'application_start'
  ) THEN
    ALTER TABLE public.placement_opportunities 
      ADD COLUMN application_start TIMESTAMPTZ;
  END IF;

  -- Add event_at if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'placement_opportunities' AND column_name = 'event_at'
  ) THEN
    ALTER TABLE public.placement_opportunities 
      ADD COLUMN event_at TIMESTAMPTZ;
  END IF;

  -- Add venue_or_link if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'placement_opportunities' AND column_name = 'venue_or_link'
  ) THEN
    ALTER TABLE public.placement_opportunities 
      ADD COLUMN venue_or_link TEXT;
  END IF;

  -- Add message_id if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'placement_opportunities' AND column_name = 'message_id'
  ) THEN
    ALTER TABLE public.placement_opportunities 
      ADD COLUMN message_id TEXT;
  END IF;

  -- Migrate category column into additional_details if category column exists
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'placement_opportunities' AND column_name = 'category'
  ) THEN
    UPDATE public.placement_opportunities
    SET additional_details = jsonb_build_array(
      jsonb_build_object('label', 'Job Profile Category', 'value', category)
    )
    WHERE category IS NOT NULL AND (additional_details IS NULL OR additional_details = '[]'::jsonb);

    ALTER TABLE public.placement_opportunities DROP COLUMN category;
  END IF;

  -- Drop raw_text / raw headers columns if they exist
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'placement_opportunities' AND column_name = 'raw_text'
  ) THEN
    ALTER TABLE public.placement_opportunities DROP COLUMN raw_text;
  END IF;

  -- Drop status column if stage is used
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'placement_opportunities' AND column_name = 'status'
  ) THEN
    ALTER TABLE public.placement_opportunities DROP COLUMN status;
  END IF;
END $$;

-- 3. Indexes & Unique constraints
ALTER TABLE public.placement_opportunities DROP CONSTRAINT IF EXISTS uq_placement_opp;
DROP INDEX IF EXISTS public.uq_placement_opp;
DROP INDEX IF EXISTS public.uq_placement_opp_external_job_id;
CREATE UNIQUE INDEX IF NOT EXISTS uq_placement_opp_external_job_id 
  ON public.placement_opportunities (program, batch_year, external_job_id) 
  WHERE external_job_id IS NOT NULL;

DROP INDEX IF EXISTS public.uq_placement_opp_message_id;
CREATE UNIQUE INDEX IF NOT EXISTS uq_placement_opp_message_id 
  ON public.placement_opportunities (message_id) 
  WHERE message_id IS NOT NULL;

DROP INDEX IF EXISTS public.idx_placement_opp_deadline;
CREATE INDEX IF NOT EXISTS idx_placement_opp_deadline 
  ON public.placement_opportunities (program, batch_year, deadline_at);

-- 4. placement_updates (Audit & History)
CREATE TABLE IF NOT EXISTS public.placement_updates (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id  UUID NOT NULL REFERENCES public.placement_opportunities(id) ON DELETE CASCADE,
  old_values      JSONB NOT NULL DEFAULT '{}'::jsonb,
  new_values      JSONB NOT NULL DEFAULT '{}'::jsonb,
  message_id      TEXT,
  changed_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_placement_updates_opp 
  ON public.placement_updates (opportunity_id, created_at DESC);

-- 5. student_applications (Per-Student Tracking)
CREATE TABLE IF NOT EXISTS public.student_applications (
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  opportunity_id  UUID NOT NULL REFERENCES public.placement_opportunities(id) ON DELETE CASCADE,
  status          TEXT NOT NULL CHECK (status IN ('interested', 'applied', 'skipped')),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, opportunity_id)
);

CREATE INDEX IF NOT EXISTS idx_student_apps_user 
  ON public.student_applications (user_id, status);

-- 6. Link Interview Experiences
ALTER TABLE public.interview_submissions
  ADD COLUMN IF NOT EXISTS opportunity_id UUID REFERENCES public.placement_opportunities(id) ON DELETE SET NULL;

-- 7. Clean up legacy email ingest items
DELETE FROM public.ingest_items WHERE batch_id IN (SELECT id FROM public.ingest_batches WHERE kind = 'email');
DELETE FROM public.ingest_batches WHERE kind = 'email';

-- 8. Row Level Security Policies
ALTER TABLE public.placement_opportunities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.placement_updates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_applications ENABLE ROW LEVEL SECURITY;

-- placement_opportunities: Read all, Write all (including admin portal & development)
DROP POLICY IF EXISTS "placement_opp_select_cohort" ON public.placement_opportunities;
DROP POLICY IF EXISTS "placement_opp_select_all" ON public.placement_opportunities;
CREATE POLICY "placement_opp_select_all" ON public.placement_opportunities
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "placement_opp_admin_all" ON public.placement_opportunities;
DROP POLICY IF EXISTS "placement_opp_write_all" ON public.placement_opportunities;
CREATE POLICY "placement_opp_write_all" ON public.placement_opportunities
  FOR ALL USING (true)
  WITH CHECK (true);

-- placement_updates: Read & Write all
DROP POLICY IF EXISTS "placement_updates_select_cohort" ON public.placement_updates;
DROP POLICY IF EXISTS "placement_updates_admin_all" ON public.placement_updates;
DROP POLICY IF EXISTS "placement_updates_write_all" ON public.placement_updates;
CREATE POLICY "placement_updates_write_all" ON public.placement_updates
  FOR ALL USING (true)
  WITH CHECK (true);

-- student_applications: Manage records
DROP POLICY IF EXISTS "student_apps_manage_own" ON public.student_applications;
DROP POLICY IF EXISTS "student_apps_all" ON public.student_applications;
CREATE POLICY "student_apps_all" ON public.student_applications
  FOR ALL USING (true)
  WITH CHECK (true);
