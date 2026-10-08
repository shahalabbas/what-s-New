-- ═══════════════════════════════════════════════════════════════════
-- Migration 0002: Seed Data for What's Next
-- Realistic IIM Udaipur MBA Term 1 data
-- Run AFTER 0001_schema.sql
-- ═══════════════════════════════════════════════════════════════════

-- ─── Courses ──────────────────────────────────────────────────────
INSERT INTO public.courses (id, code, name, faculty, color_tag) VALUES
  ('a1b2c3d4-0001-0001-0001-000000000001', 'MKT501', 'Marketing Management',     'Prof. Anita Sharma',       '#0A84FF'),
  ('a1b2c3d4-0001-0001-0001-000000000002', 'FIN502', 'Financial Accounting',      'Prof. Rajesh Mehta',       '#34C759'),
  ('a1b2c3d4-0001-0001-0001-000000000003', 'OPS503', 'Operations Management',     'Prof. Sunita Patel',       '#FF9F0A'),
  ('a1b2c3d4-0001-0001-0001-000000000004', 'ECO504', 'Managerial Economics',      'Prof. Vikram Nair',        '#FF3B30'),
  ('a1b2c3d4-0001-0001-0001-000000000005', 'QM505',  'Quantitative Methods',      'Prof. Deepak Gupta',       '#BF5AF2'),
  ('a1b2c3d4-0001-0001-0001-000000000006', 'OB506',  'Organizational Behaviour',  'Prof. Priya Krishnan',     '#FF6B35'),
  ('a1b2c3d4-0001-0001-0001-000000000007', 'IT507',  'IT for Managers',           'Prof. Arun Mishra',        '#5AC8FA')
ON CONFLICT (code) DO NOTHING;

-- ─── Timetable Slots (Monday=1 … Saturday=6) ─────────────────────
INSERT INTO public.timetable_slots (course_id, day_of_week, start_time, end_time, room, session_type) VALUES
  -- Monday
  ('a1b2c3d4-0001-0001-0001-000000000001', 1, '09:00', '10:30', 'LH-1', 'lecture'),
  ('a1b2c3d4-0001-0001-0001-000000000002', 1, '11:00', '12:30', 'LH-2', 'lecture'),
  ('a1b2c3d4-0001-0001-0001-000000000003', 1, '14:00', '15:30', 'LH-1', 'lecture'),
  ('a1b2c3d4-0001-0001-0001-000000000005', 1, '16:00', '17:30', 'CR-3', 'tutorial'),

  -- Tuesday
  ('a1b2c3d4-0001-0001-0001-000000000004', 2, '09:00', '10:30', 'LH-3', 'lecture'),
  ('a1b2c3d4-0001-0001-0001-000000000006', 2, '11:00', '12:30', 'LH-1', 'lecture'),
  ('a1b2c3d4-0001-0001-0001-000000000007', 2, '14:00', '15:30', 'CR-2', 'lecture'),
  ('a1b2c3d4-0001-0001-0001-000000000001', 2, '16:00', '17:00', 'CR-1', 'tutorial'),

  -- Wednesday
  ('a1b2c3d4-0001-0001-0001-000000000002', 3, '09:00', '10:30', 'LH-2', 'lecture'),
  ('a1b2c3d4-0001-0001-0001-000000000003', 3, '11:00', '12:30', 'LH-3', 'tutorial'),
  ('a1b2c3d4-0001-0001-0001-000000000005', 3, '14:00', '15:30', 'CR-3', 'lecture'),

  -- Thursday
  ('a1b2c3d4-0001-0001-0001-000000000004', 4, '09:00', '10:30', 'LH-1', 'lecture'),
  ('a1b2c3d4-0001-0001-0001-000000000006', 4, '11:00', '12:30', 'LH-2', 'lecture'),
  ('a1b2c3d4-0001-0001-0001-000000000007', 4, '14:00', '15:30', 'LH-3', 'lecture'),
  ('a1b2c3d4-0001-0001-0001-000000000002', 4, '16:00', '17:00', 'CR-1', 'tutorial'),

  -- Friday
  ('a1b2c3d4-0001-0001-0001-000000000001', 5, '09:00', '10:30', 'LH-1', 'lecture'),
  ('a1b2c3d4-0001-0001-0001-000000000003', 5, '11:00', '12:30', 'LH-3', 'lecture'),
  ('a1b2c3d4-0001-0001-0001-000000000005', 5, '14:00', '16:30', 'CR-3', 'exam'),

  -- Saturday (light day)
  ('a1b2c3d4-0001-0001-0001-000000000006', 6, '09:00', '10:30', 'LH-2', 'lecture'),
  ('a1b2c3d4-0001-0001-0001-000000000004', 6, '11:00', '12:00', 'CR-2', 'tutorial')
;

-- ─── Timetable Overrides (sample for this week) ───────────────────
-- Get a slot id for the cancellation (MKT501 Monday 9am)
-- Note: These UUIDs won't match actual generated IDs — adjust after running schema
-- Instead we use a subquery approach:

INSERT INTO public.timetable_overrides (date, slot_id, action, note)
SELECT
  '2026-10-12'::date,
  id,
  'cancelled',
  'Faculty unavailable — Dean''s meeting'
FROM public.timetable_slots
WHERE course_id = 'a1b2c3d4-0001-0001-0001-000000000001'
  AND day_of_week = 1
  AND start_time = '09:00'
LIMIT 1;

-- Rescheduled: OPS503 Wednesday tutorial moved to 13:00
INSERT INTO public.timetable_overrides (date, slot_id, action, new_start, new_end, new_room, note)
SELECT
  '2026-10-14'::date,
  id,
  'rescheduled',
  '13:00',
  '14:30',
  'LH-4',
  'Room change due to seminar in LH-3'
FROM public.timetable_slots
WHERE course_id = 'a1b2c3d4-0001-0001-0001-000000000003'
  AND day_of_week = 3
  AND start_time = '11:00'
LIMIT 1;

-- Extra session: Guest lecture Thursday evening
INSERT INTO public.timetable_overrides (date, slot_id, action, new_start, new_end, new_room, note, course_id)
VALUES (
  '2026-10-15'::date,
  NULL,
  'extra',
  '17:00',
  '18:30',
  'Auditorium',
  'Guest Lecture: Digital Transformation in FMCG — Mr. Ravi Kapoor (HUL)',
  'a1b2c3d4-0001-0001-0001-000000000001'
);

-- ─── Mess Menu (this week) ────────────────────────────────────────
INSERT INTO public.mess_menu (date, meal, items, start_time, end_time) VALUES
  -- Monday Oct 12
  ('2026-10-12', 'breakfast', ARRAY['Idli','Sambar','Coconut Chutney','Bread','Butter','Boiled Eggs','Tea/Coffee'], '07:30', '09:30'),
  ('2026-10-12', 'lunch',     ARRAY['Dal Tadka','Jeera Rice','Roti','Aloo Gobi','Raita','Salad','Buttermilk'], '12:00', '14:30'),
  ('2026-10-12', 'snacks',    ARRAY['Veg Pakoras','Masala Chai','Biscuits'], '16:30', '18:00'),
  ('2026-10-12', 'dinner',    ARRAY['Paneer Butter Masala','Naan','Pulao','Dal Makhani','Gulab Jamun'], '19:30', '21:30'),

  -- Tuesday Oct 13
  ('2026-10-13', 'breakfast', ARRAY['Poha','Jalebi','Boiled Eggs','Bread','Tea/Coffee'], '07:30', '09:30'),
  ('2026-10-13', 'lunch',     ARRAY['Rajma','Rice','Roti','Bhindi Masala','Curd','Salad'], '12:00', '14:30'),
  ('2026-10-13', 'snacks',    ARRAY['Samosa','Mint Chutney','Tea'], '16:30', '18:00'),
  ('2026-10-13', 'dinner',    ARRAY['Chicken Curry','Roti','Rice','Dal','Kheer'], '19:30', '21:30'),

  -- Wednesday Oct 14
  ('2026-10-14', 'breakfast', ARRAY['Upma','Coconut Chutney','Bread','Omelette','Coffee'], '07:30', '09:30'),
  ('2026-10-14', 'lunch',     ARRAY['Chhole','Puri','Aloo Sabzi','Raita','Pickle'], '12:00', '14:30'),
  ('2026-10-14', 'snacks',    ARRAY['Dahi Vada','Sev Puri','Tea'], '16:30', '18:00'),
  ('2026-10-14', 'dinner',    ARRAY['Matar Paneer','Roti','Jeera Rice','Dal Fry','Fruit Custard'], '19:30', '21:30'),

  -- Thursday Oct 15
  ('2026-10-15', 'breakfast', ARRAY['Dosa','Sambar','Chutney','Bread','Eggs','Tea'], '07:30', '09:30'),
  ('2026-10-15', 'lunch',     ARRAY['Dal','Rice','Roti','Mix Veg','Papad','Salad'], '12:00', '14:30'),
  ('2026-10-15', 'snacks',    ARRAY['Bread Pakora','Ketchup','Coffee'], '16:30', '18:00'),
  ('2026-10-15', 'dinner',    ARRAY['Palak Paneer','Tandoori Roti','Veg Biryani','Raita','Gajar Halwa'], '19:30', '21:30'),

  -- Friday Oct 16
  ('2026-10-16', 'breakfast', ARRAY['Parathe','Curd','Pickle','Boiled Eggs','Tea'], '07:30', '09:30'),
  ('2026-10-16', 'lunch',     ARRAY['Kadhi Chawal','Roti','Aloo Methi','Raita'], '12:00', '14:30'),
  ('2026-10-16', 'snacks',    ARRAY['Popcorn','Cold Coffee','Cookies'], '16:30', '18:00'),
  ('2026-10-16', 'dinner',    ARRAY['Mutton Curry','Roti','Rice','Dal','Phirni'], '19:30', '21:30')

ON CONFLICT (date, meal) DO NOTHING;

-- ─── Projects ─────────────────────────────────────────────────────
INSERT INTO public.projects (course_id, title, description, type, group_size, deadline, submission_link, status) VALUES
  (
    'a1b2c3d4-0001-0001-0001-000000000001',
    'Consumer Behaviour Analysis',
    'Analyse buying behaviour of a target segment for a product of your choice. Present findings with primary research (min 30 respondents).',
    'assignment', 3,
    '2026-10-20 23:59:00+05:30',
    'https://forms.gle/example1',
    'open'
  ),
  (
    'a1b2c3d4-0001-0001-0001-000000000002',
    'Financial Statement Analysis',
    'Pick any listed company. Analyse 5 years of financial statements, compute key ratios, and write a 2000-word report.',
    'assignment', 1,
    '2026-10-18 23:59:00+05:30',
    NULL,
    'open'
  ),
  (
    'a1b2c3d4-0001-0001-0001-000000000003',
    'Operations Case Study — Amazon Logistics',
    'In-depth case analysis of Amazon India''s last-mile delivery operations. Focus on efficiency bottlenecks and recommendations.',
    'project', 4,
    '2026-11-01 23:59:00+05:30',
    'https://teams.microsoft.com/example',
    'open'
  ),
  (
    'a1b2c3d4-0001-0001-0001-000000000005',
    'Regression Assignment',
    'Build a multiple regression model using the provided dataset. Submit R/Python code + write-up.',
    'assignment', 2,
    '2026-10-22 23:59:00+05:30',
    NULL,
    'open'
  ),
  (
    'a1b2c3d4-0001-0001-0001-000000000001',
    'Brand Strategy Project',
    'End-term project: Develop a complete brand strategy for a new product launch. Include segmentation, targeting, positioning, and marketing mix.',
    'end-term', 5,
    '2026-11-30 23:59:00+05:30',
    NULL,
    'open'
  )
;

-- ─── Sample Interview Submissions (anonymous) ─────────────────────
INSERT INTO public.interview_submissions
  (company, role, round_type, interview_date, questions, experience, tips, difficulty, outcome, is_anonymous, user_id)
VALUES
  (
    'McKinsey & Company', 'Summer Intern', 'Case Interview',
    '2026-09-15',
    'Market entry strategy for a European telecom in India. Profitability case for a hospital chain.',
    'Two rounds on the same day. Interviewers were friendly but probing. Structure your thoughts clearly before speaking.',
    'Practice with actual cases from McKinsey''s website. Math speed matters a lot. MECE framework is essential.',
    4, 'selected', TRUE, NULL
  ),
  (
    'Deloitte', 'Analyst', 'HR + Technical',
    '2026-09-22',
    'Tell me about yourself. Walk me through a time you led a team. Excel test with pivot tables and VLOOKUP.',
    'Straightforward process. HR was the real filter. Technical was basic.',
    'Know your resume inside out. Practice star method for behavioural questions.',
    2, 'selected', FALSE, NULL
  ),
  (
    'HDFC Bank', 'Management Trainee', 'Group Discussion + PI',
    '2026-09-28',
    'GD topic: Should India raise the retirement age to 65? PI: Why banking? Where do you see yourself in 5 years?',
    'GD was competitive with 12 students. PI panel was a VP and HR manager.',
    'Be assertive but not aggressive in GD. Have a clear answer on why banking.',
    3, 'waiting', TRUE, NULL
  )
;
