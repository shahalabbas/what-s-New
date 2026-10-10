-- ═══════════════════════════════════════════════════════════════════
-- Migration 0008: Fix RLS policies for projects, courses, and interviews
-- ═══════════════════════════════════════════════════════════════════

-- 1. Projects Table RLS: Allow Read & Write for all authenticated / anon users
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "projects_select_all" ON public.projects;
DROP POLICY IF EXISTS "projects_write_all" ON public.projects;
DROP POLICY IF EXISTS "projects_admin_all" ON public.projects;
DROP POLICY IF EXISTS "projects_select_cohort" ON public.projects;
DROP POLICY IF EXISTS "Enable read access for all users" ON public.projects;
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON public.projects;

CREATE POLICY "projects_select_all" ON public.projects
  FOR SELECT USING (true);

CREATE POLICY "projects_write_all" ON public.projects
  FOR ALL USING (true)
  WITH CHECK (true);

-- 2. Courses Table RLS
ALTER TABLE public.courses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "courses_select_all" ON public.courses;
DROP POLICY IF EXISTS "courses_write_all" ON public.courses;

CREATE POLICY "courses_select_all" ON public.courses
  FOR SELECT USING (true);

CREATE POLICY "courses_write_all" ON public.courses
  FOR ALL USING (true)
  WITH CHECK (true);

-- 3. Interview Submissions Table RLS
ALTER TABLE public.interview_submissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "interview_submissions_select_all" ON public.interview_submissions;
DROP POLICY IF EXISTS "interview_submissions_write_all" ON public.interview_submissions;

CREATE POLICY "interview_submissions_select_all" ON public.interview_submissions
  FOR SELECT USING (true);

CREATE POLICY "interview_submissions_write_all" ON public.interview_submissions
  FOR ALL USING (true)
  WITH CHECK (true);
