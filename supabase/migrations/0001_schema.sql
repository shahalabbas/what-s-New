-- ═══════════════════════════════════════════════════════════════════
-- Migration 0001: Schema for What's Next Campus App
-- Run this in your Supabase SQL Editor → New query
-- ═══════════════════════════════════════════════════════════════════

-- Enable UUID extension (usually already enabled in Supabase)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── profiles ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.profiles (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name   TEXT,
  avatar_url  TEXT,
  role        TEXT NOT NULL DEFAULT 'student'
              CHECK (role IN ('student', 'admin')),
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Auto-create profile on sign-up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'avatar_url'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ─── courses ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.courses (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code       TEXT NOT NULL UNIQUE,
  name       TEXT NOT NULL,
  faculty    TEXT,
  color_tag  TEXT NOT NULL DEFAULT '#0A84FF'
);

-- ─── timetable_slots (recurring weekly) ──────────────────────────
CREATE TABLE IF NOT EXISTS public.timetable_slots (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id    UUID REFERENCES public.courses(id) ON DELETE CASCADE,
  day_of_week  SMALLINT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  start_time   TIME NOT NULL,
  end_time     TIME NOT NULL,
  room         TEXT,
  session_type TEXT NOT NULL DEFAULT 'lecture'
               CHECK (session_type IN ('lecture','tutorial','exam','other'))
);

-- ─── timetable_overrides (date-specific) ─────────────────────────
CREATE TABLE IF NOT EXISTS public.timetable_overrides (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date      DATE NOT NULL,
  slot_id   UUID REFERENCES public.timetable_slots(id) ON DELETE SET NULL,
  action    TEXT NOT NULL CHECK (action IN ('cancelled','rescheduled','extra')),
  new_start TIME,
  new_end   TIME,
  new_room  TEXT,
  note      TEXT,
  course_id UUID REFERENCES public.courses(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_overrides_date ON public.timetable_overrides(date);

-- ─── mess_menu ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.mess_menu (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date       DATE NOT NULL,
  meal       TEXT NOT NULL CHECK (meal IN ('breakfast','lunch','snacks','dinner')),
  items      TEXT[] NOT NULL DEFAULT '{}',
  start_time TIME NOT NULL,
  end_time   TIME NOT NULL,
  UNIQUE (date, meal)
);

CREATE INDEX IF NOT EXISTS idx_mess_date ON public.mess_menu(date);

-- ─── projects ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.projects (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id        UUID REFERENCES public.courses(id) ON DELETE SET NULL,
  title            TEXT NOT NULL,
  description      TEXT,
  type             TEXT NOT NULL CHECK (type IN ('assignment','project','end-term')),
  group_size       SMALLINT DEFAULT 1,
  deadline         TIMESTAMPTZ NOT NULL,
  submission_link  TEXT,
  attachments      TEXT[] DEFAULT '{}',
  status           TEXT NOT NULL DEFAULT 'open'
                   CHECK (status IN ('open','submitted','graded'))
);

CREATE INDEX IF NOT EXISTS idx_projects_deadline ON public.projects(deadline);

-- ─── interview_submissions ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.interview_submissions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  company        TEXT NOT NULL,
  role           TEXT NOT NULL,
  round_type     TEXT,
  interview_date DATE,
  questions      TEXT,
  experience     TEXT,
  tips           TEXT,
  difficulty     SMALLINT CHECK (difficulty BETWEEN 1 AND 5),
  outcome        TEXT,
  is_anonymous   BOOLEAN NOT NULL DEFAULT FALSE,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════════════
-- Row Level Security
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.timetable_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.timetable_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mess_menu ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.interview_submissions ENABLE ROW LEVEL SECURITY;

-- Helper function: check if current user is admin
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ─── profiles policies ────────────────────────────────────────────
DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;
CREATE POLICY "profiles_select_own" ON public.profiles
  FOR SELECT USING (auth.uid() = id OR public.is_admin());

DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
CREATE POLICY "profiles_update_own" ON public.profiles
  FOR UPDATE USING (auth.uid() = id OR public.is_admin());

-- ─── courses policies ─────────────────────────────────────────────
DROP POLICY IF EXISTS "courses_select_all" ON public.courses;
CREATE POLICY "courses_select_all" ON public.courses
  FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "courses_admin_insert" ON public.courses;
CREATE POLICY "courses_admin_insert" ON public.courses
  FOR INSERT WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "courses_admin_update" ON public.courses;
CREATE POLICY "courses_admin_update" ON public.courses
  FOR UPDATE USING (public.is_admin());

DROP POLICY IF EXISTS "courses_admin_delete" ON public.courses;
CREATE POLICY "courses_admin_delete" ON public.courses
  FOR DELETE USING (public.is_admin());

-- ─── timetable_slots policies ─────────────────────────────────────
DROP POLICY IF EXISTS "slots_select_all" ON public.timetable_slots;
CREATE POLICY "slots_select_all" ON public.timetable_slots
  FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "slots_admin_insert" ON public.timetable_slots;
CREATE POLICY "slots_admin_insert" ON public.timetable_slots
  FOR INSERT WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "slots_admin_update" ON public.timetable_slots;
CREATE POLICY "slots_admin_update" ON public.timetable_slots
  FOR UPDATE USING (public.is_admin());

DROP POLICY IF EXISTS "slots_admin_delete" ON public.timetable_slots;
CREATE POLICY "slots_admin_delete" ON public.timetable_slots
  FOR DELETE USING (public.is_admin());

-- ─── timetable_overrides policies ────────────────────────────────
DROP POLICY IF EXISTS "overrides_select_all" ON public.timetable_overrides;
CREATE POLICY "overrides_select_all" ON public.timetable_overrides
  FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "overrides_admin_insert" ON public.timetable_overrides;
CREATE POLICY "overrides_admin_insert" ON public.timetable_overrides
  FOR INSERT WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "overrides_admin_update" ON public.timetable_overrides;
CREATE POLICY "overrides_admin_update" ON public.timetable_overrides
  FOR UPDATE USING (public.is_admin());

DROP POLICY IF EXISTS "overrides_admin_delete" ON public.timetable_overrides;
CREATE POLICY "overrides_admin_delete" ON public.timetable_overrides
  FOR DELETE USING (public.is_admin());

-- ─── mess_menu policies ───────────────────────────────────────────
DROP POLICY IF EXISTS "mess_select_all" ON public.mess_menu;
CREATE POLICY "mess_select_all" ON public.mess_menu
  FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "mess_admin_insert" ON public.mess_menu;
CREATE POLICY "mess_admin_insert" ON public.mess_menu
  FOR INSERT WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "mess_admin_update" ON public.mess_menu;
CREATE POLICY "mess_admin_update" ON public.mess_menu
  FOR UPDATE USING (public.is_admin());

DROP POLICY IF EXISTS "mess_admin_delete" ON public.mess_menu;
CREATE POLICY "mess_admin_delete" ON public.mess_menu
  FOR DELETE USING (public.is_admin());

-- ─── projects policies ────────────────────────────────────────────
DROP POLICY IF EXISTS "projects_select_all" ON public.projects;
CREATE POLICY "projects_select_all" ON public.projects
  FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "projects_admin_insert" ON public.projects;
CREATE POLICY "projects_admin_insert" ON public.projects
  FOR INSERT WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "projects_admin_update" ON public.projects;
CREATE POLICY "projects_admin_update" ON public.projects
  FOR UPDATE USING (public.is_admin());

DROP POLICY IF EXISTS "projects_admin_delete" ON public.projects;
CREATE POLICY "projects_admin_delete" ON public.projects
  FOR DELETE USING (public.is_admin());

-- ─── interview_submissions policies ──────────────────────────────
DROP POLICY IF EXISTS "interviews_select_all" ON public.interview_submissions;
CREATE POLICY "interviews_select_all" ON public.interview_submissions
  FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "interviews_insert_own" ON public.interview_submissions;
CREATE POLICY "interviews_insert_own" ON public.interview_submissions
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL AND
    (user_id = auth.uid() OR user_id IS NULL)
  );

DROP POLICY IF EXISTS "interviews_update_own" ON public.interview_submissions;
CREATE POLICY "interviews_update_own" ON public.interview_submissions
  FOR UPDATE USING (user_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "interviews_delete_own" ON public.interview_submissions;
CREATE POLICY "interviews_delete_own" ON public.interview_submissions
  FOR DELETE USING (user_id = auth.uid() OR public.is_admin());
