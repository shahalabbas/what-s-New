-- ═══════════════════════════════════════════════════════════════════
-- Migration 0003: Strict Cohort Access Control & Google OAuth Setup
-- Targets IIM Udaipur DEM 2026 batch with zero-code extensibility
-- ═══════════════════════════════════════════════════════════════════

-- ─── 1. allowed_cohorts table ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.allowed_cohorts (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  program      TEXT NOT NULL,
  batch_year   INTEGER NOT NULL,
  display_name TEXT NOT NULL,
  is_active    BOOLEAN NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_cohort_program_year UNIQUE (program, batch_year)
);

-- Seed initial active cohort: DEM 2026
INSERT INTO public.allowed_cohorts (program, batch_year, display_name, is_active)
VALUES ('dem', 2026, 'DEM 2026', true)
ON CONFLICT (program, batch_year) DO UPDATE
SET is_active = EXCLUDED.is_active, display_name = EXCLUDED.display_name;

-- ─── 2. admin_emails table ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.admin_emails (
  email       TEXT PRIMARY KEY,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Seed initial admin
INSERT INTO public.admin_emails (email)
VALUES ('shahalabbasv.dem2026@iimu.ac.in')
ON CONFLICT (email) DO NOTHING;

-- ─── 3. profiles updates ──────────────────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS email TEXT,
  ADD COLUMN IF NOT EXISTS program TEXT,
  ADD COLUMN IF NOT EXISTS batch_year INTEGER;

CREATE INDEX IF NOT EXISTS idx_profiles_cohort
  ON public.profiles(program, batch_year);
CREATE INDEX IF NOT EXISTS idx_profiles_email
  ON public.profiles(email);

-- ─── 4. Scope content tables by cohort ────────────────────────────
ALTER TABLE public.courses
  ADD COLUMN IF NOT EXISTS program TEXT NOT NULL DEFAULT 'dem',
  ADD COLUMN IF NOT EXISTS batch_year INTEGER NOT NULL DEFAULT 2026;

ALTER TABLE public.timetable_slots
  ADD COLUMN IF NOT EXISTS program TEXT NOT NULL DEFAULT 'dem',
  ADD COLUMN IF NOT EXISTS batch_year INTEGER NOT NULL DEFAULT 2026;

ALTER TABLE public.timetable_overrides
  ADD COLUMN IF NOT EXISTS program TEXT NOT NULL DEFAULT 'dem',
  ADD COLUMN IF NOT EXISTS batch_year INTEGER NOT NULL DEFAULT 2026;

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS program TEXT NOT NULL DEFAULT 'dem',
  ADD COLUMN IF NOT EXISTS batch_year INTEGER NOT NULL DEFAULT 2026;

ALTER TABLE public.interview_submissions
  ADD COLUMN IF NOT EXISTS program TEXT NOT NULL DEFAULT 'dem',
  ADD COLUMN IF NOT EXISTS batch_year INTEGER NOT NULL DEFAULT 2026;

-- Backfill all existing records to ('dem', 2026)
UPDATE public.courses SET program = 'dem', batch_year = 2026 WHERE program IS NULL;
UPDATE public.timetable_slots SET program = 'dem', batch_year = 2026 WHERE program IS NULL;
UPDATE public.timetable_overrides SET program = 'dem', batch_year = 2026 WHERE program IS NULL;
UPDATE public.projects SET program = 'dem', batch_year = 2026 WHERE program IS NULL;
UPDATE public.interview_submissions SET program = 'dem', batch_year = 2026 WHERE program IS NULL;

-- ─── 5. Helper function: parse_iimu_email ─────────────────────────
CREATE OR REPLACE FUNCTION public.parse_iimu_email(user_email TEXT)
RETURNS TABLE (program TEXT, batch_year INTEGER, is_valid BOOLEAN) AS $$
DECLARE
  clean_email TEXT;
  matches TEXT[];
BEGIN
  clean_email := lower(trim(user_email));

  -- Case-insensitive regex: ^[a-z0-9._-]+\.([a-z]+)(\d{4})@iimu\.ac\.in$
  matches := regexp_matches(clean_email, '^[a-z0-9._-]+\.([a-z]+)(\d{4})@iimu\.ac\.in$');

  IF matches IS NOT NULL AND array_length(matches, 1) = 2 THEN
    RETURN QUERY SELECT matches[1], matches[2]::INTEGER, true;
  ELSE
    RETURN QUERY SELECT NULL::TEXT, NULL::INTEGER, false;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER IMMUTABLE;

-- ─── 6. Auth Hook: Before User Created ───────────────────────────
-- In Supabase Dashboard → Authentication → Hooks → "Before User Created"
-- Select: public.before_user_created_hook
CREATE OR REPLACE FUNCTION public.before_user_created_hook(event jsonb)
RETURNS jsonb AS $$
DECLARE
  user_email TEXT;
  parsed_prog TEXT;
  parsed_year INTEGER;
  email_valid BOOLEAN;
  cohort_active BOOLEAN;
  is_admin_email BOOLEAN;
BEGIN
  user_email := lower(trim(event->'user'->>'email'));

  -- 1. Must have an email ending with @iimu.ac.in
  IF user_email IS NULL OR NOT user_email LIKE '%@iimu.ac.in' THEN
    RAISE EXCEPTION 'This app is currently available only to IIM Udaipur students with @iimu.ac.in email.';
  END IF;

  -- 2. Check if email is in admin allowlist
  SELECT EXISTS (
    SELECT 1 FROM public.admin_emails WHERE lower(email) = user_email
  ) INTO is_admin_email;

  IF is_admin_email THEN
    RETURN event;
  END IF;

  -- 3. Parse cohort info from email
  SELECT p.program, p.batch_year, p.is_valid
  INTO parsed_prog, parsed_year, email_valid
  FROM public.parse_iimu_email(user_email) p;

  IF NOT email_valid THEN
    RAISE EXCEPTION 'Invalid student email format. Must be <name>.<program><year>@iimu.ac.in';
  END IF;

  -- 4. Check if parsed cohort is currently active
  SELECT EXISTS (
    SELECT 1 FROM public.allowed_cohorts
    WHERE lower(program) = parsed_prog
      AND batch_year = parsed_year
      AND is_active = true
  ) INTO cohort_active;

  IF NOT cohort_active THEN
    RAISE EXCEPTION 'This app is currently available only to DEM 2026 students.';
  END IF;

  RETURN event;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─── 7. Auto-Profile Creation Trigger on auth.users ───────────────
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  user_email TEXT;
  parsed_prog TEXT;
  parsed_year INTEGER;
  user_role TEXT := 'student';
BEGIN
  user_email := lower(trim(NEW.email));

  -- Check admin role
  IF EXISTS (SELECT 1 FROM public.admin_emails WHERE lower(email) = user_email) THEN
    user_role := 'admin';
  END IF;

  -- Parse cohort
  SELECT p.program, p.batch_year
  INTO parsed_prog, parsed_year
  FROM public.parse_iimu_email(user_email) p;

  IF parsed_prog IS NULL THEN
    parsed_prog := 'dem';
    parsed_year := 2026;
  END IF;

  INSERT INTO public.profiles (
    id,
    email,
    full_name,
    avatar_url,
    program,
    batch_year,
    role
  )
  VALUES (
    NEW.id,
    user_email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', 'Student'),
    NEW.raw_user_meta_data->>'avatar_url',
    parsed_prog,
    parsed_year,
    user_role
  )
  ON CONFLICT (id) DO UPDATE
  SET
    email = EXCLUDED.email,
    full_name = EXCLUDED.full_name,
    avatar_url = EXCLUDED.avatar_url,
    program = EXCLUDED.program,
    batch_year = EXCLUDED.batch_year,
    role = EXCLUDED.role;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─── 8. RLS Policies Scoped by Cohort ─────────────────────────────
-- Function to get current user's cohort
CREATE OR REPLACE FUNCTION public.get_current_profile()
RETURNS TABLE (program TEXT, batch_year INTEGER, role TEXT) AS $$
  SELECT program, batch_year, role
  FROM public.profiles
  WHERE id = auth.uid()
  LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Ensure RLS is active on all tables
ALTER TABLE public.allowed_cohorts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_emails ENABLE ROW LEVEL SECURITY;

-- allowed_cohorts policies
DROP POLICY IF EXISTS "cohorts_select_all" ON public.allowed_cohorts;
CREATE POLICY "cohorts_select_all" ON public.allowed_cohorts
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "cohorts_admin_modify" ON public.allowed_cohorts;
CREATE POLICY "cohorts_admin_modify" ON public.allowed_cohorts
  FOR ALL USING (public.is_admin());

-- admin_emails policies
DROP POLICY IF EXISTS "admin_emails_select" ON public.admin_emails;
CREATE POLICY "admin_emails_select" ON public.admin_emails
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- courses policies (scoped to cohort)
DROP POLICY IF EXISTS "courses_select_all" ON public.courses;
DROP POLICY IF EXISTS "courses_select_cohort" ON public.courses;
CREATE POLICY "courses_select_cohort" ON public.courses
  FOR SELECT USING (
    (program, batch_year) = (
      SELECT p.program, p.batch_year FROM public.get_current_profile() p
    )
  );

DROP POLICY IF EXISTS "courses_admin_insert" ON public.courses;
DROP POLICY IF EXISTS "courses_admin_update" ON public.courses;
DROP POLICY IF EXISTS "courses_admin_delete" ON public.courses;
DROP POLICY IF EXISTS "courses_admin_all" ON public.courses;
CREATE POLICY "courses_admin_all" ON public.courses
  FOR ALL USING (
    public.is_admin() AND
    (program, batch_year) = (
      SELECT p.program, p.batch_year FROM public.get_current_profile() p
    )
  );

-- timetable_slots policies (scoped to cohort)
DROP POLICY IF EXISTS "slots_select_all" ON public.timetable_slots;
DROP POLICY IF EXISTS "slots_select_cohort" ON public.timetable_slots;
CREATE POLICY "slots_select_cohort" ON public.timetable_slots
  FOR SELECT USING (
    (program, batch_year) = (
      SELECT p.program, p.batch_year FROM public.get_current_profile() p
    )
  );

DROP POLICY IF EXISTS "slots_admin_insert" ON public.timetable_slots;
DROP POLICY IF EXISTS "slots_admin_update" ON public.timetable_slots;
DROP POLICY IF EXISTS "slots_admin_delete" ON public.timetable_slots;
DROP POLICY IF EXISTS "slots_admin_all" ON public.timetable_slots;
CREATE POLICY "slots_admin_all" ON public.timetable_slots
  FOR ALL USING (
    public.is_admin() AND
    (program, batch_year) = (
      SELECT p.program, p.batch_year FROM public.get_current_profile() p
    )
  );

-- timetable_overrides policies (scoped to cohort)
DROP POLICY IF EXISTS "overrides_select_all" ON public.timetable_overrides;
DROP POLICY IF EXISTS "overrides_select_cohort" ON public.timetable_overrides;
CREATE POLICY "overrides_select_cohort" ON public.timetable_overrides
  FOR SELECT USING (
    (program, batch_year) = (
      SELECT p.program, p.batch_year FROM public.get_current_profile() p
    )
  );

DROP POLICY IF EXISTS "overrides_admin_insert" ON public.timetable_overrides;
DROP POLICY IF EXISTS "overrides_admin_update" ON public.timetable_overrides;
DROP POLICY IF EXISTS "overrides_admin_delete" ON public.timetable_overrides;
DROP POLICY IF EXISTS "overrides_admin_all" ON public.timetable_overrides;
CREATE POLICY "overrides_admin_all" ON public.timetable_overrides
  FOR ALL USING (
    public.is_admin() AND
    (program, batch_year) = (
      SELECT p.program, p.batch_year FROM public.get_current_profile() p
    )
  );

-- projects policies (scoped to cohort)
DROP POLICY IF EXISTS "projects_select_all" ON public.projects;
DROP POLICY IF EXISTS "projects_select_cohort" ON public.projects;
CREATE POLICY "projects_select_cohort" ON public.projects
  FOR SELECT USING (
    (program, batch_year) = (
      SELECT p.program, p.batch_year FROM public.get_current_profile() p
    )
  );

DROP POLICY IF EXISTS "projects_admin_insert" ON public.projects;
DROP POLICY IF EXISTS "projects_admin_update" ON public.projects;
DROP POLICY IF EXISTS "projects_admin_delete" ON public.projects;
DROP POLICY IF EXISTS "projects_admin_all" ON public.projects;
CREATE POLICY "projects_admin_all" ON public.projects
  FOR ALL USING (
    public.is_admin() AND
    (program, batch_year) = (
      SELECT p.program, p.batch_year FROM public.get_current_profile() p
    )
  );

-- interview_submissions policies (scoped to cohort)
DROP POLICY IF EXISTS "interviews_select_all" ON public.interview_submissions;
DROP POLICY IF EXISTS "interviews_select_cohort" ON public.interview_submissions;
CREATE POLICY "interviews_select_cohort" ON public.interview_submissions
  FOR SELECT USING (
    (program, batch_year) = (
      SELECT p.program, p.batch_year FROM public.get_current_profile() p
    )
  );

DROP POLICY IF EXISTS "interviews_insert_own" ON public.interview_submissions;
DROP POLICY IF EXISTS "interviews_insert_cohort" ON public.interview_submissions;
CREATE POLICY "interviews_insert_cohort" ON public.interview_submissions
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL AND
    (program, batch_year) = (
      SELECT p.program, p.batch_year FROM public.get_current_profile() p
    )
  );

DROP POLICY IF EXISTS "interviews_update_own" ON public.interview_submissions;
DROP POLICY IF EXISTS "interviews_delete_own" ON public.interview_submissions;
DROP POLICY IF EXISTS "interviews_modify_own" ON public.interview_submissions;
CREATE POLICY "interviews_modify_own" ON public.interview_submissions
  FOR ALL USING (
    user_id = auth.uid() OR public.is_admin()
  );
