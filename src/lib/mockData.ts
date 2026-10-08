import type { Course, MessMenu, Project, InterviewSubmission, Profile, ClassSession, CampusEvent, Term, IngestItem } from '../types'

export const MOCK_USER: Profile = {
  id: 'demo-student-id',
  email: 'student.dem2026@iimu.ac.in',
  full_name: 'Shahal Abbas',
  avatar_url: null,
  program: 'dem',
  batch_year: 2026,
  role: 'student',
  created_at: '2026-10-01T00:00:00Z',
}

export const MOCK_ADMIN: Profile = {
  id: 'demo-admin-id',
  email: 'shahalabbasv.dem2026@iimu.ac.in',
  full_name: 'Shahal Abbas (Admin)',
  avatar_url: null,
  program: 'dem',
  batch_year: 2026,
  role: 'admin',
  created_at: '2026-10-01T00:00:00Z',
}

export const MOCK_TERMS: Term[] = [
  {
    id: 'term-term3_2026',
    term_key: 'term3_2026',
    program: 'dem',
    batch_year: 2026,
    term_name: 'Term-III',
    start_date: '2026-09-21',
    end_date: '2026-12-19',
    default_venue: 'CR-7C-15',
    updated_as_on: '2026-09-18',
  },
]

import termData from './termData.json'
import messData from './messData.json'
import type { MessWeek, MessMenuItem, MessMealTiming, MessMenuDay } from '../types'
import { buildDayMenus } from './flatMessMenuImporter'

function loadStored<T>(key: string, defaultVal: T): T {
  try {
    const val = localStorage.getItem(key)
    return val ? JSON.parse(val) : defaultVal
  } catch {
    return defaultVal
  }
}

export const MOCK_COURSES: Course[] = loadStored('whats_next_courses', termData.courses as Course[])
export const MOCK_CLASS_SESSIONS: ClassSession[] = loadStored('whats_next_class_sessions', termData.sessions as unknown as ClassSession[])
export const MOCK_EVENTS: CampusEvent[] = loadStored('whats_next_events', termData.events as unknown as CampusEvent[])

export const MOCK_MESS_WEEKS: MessWeek[] = loadStored('whats_next_mess_weeks', messData.weeks as MessWeek[])
export const MOCK_MESS_MEAL_TIMINGS: MessMealTiming[] = loadStored('whats_next_mess_timings', messData.timings as MessMealTiming[])
export const MOCK_MESS_MENU_ITEMS: MessMenuItem[] = loadStored('whats_next_mess_items', messData.items as unknown as MessMenuItem[])

export function getMockDayMenus(targetDate: string): MessMenuDay[] {
  const dayItems = MOCK_MESS_MENU_ITEMS.filter((i) => i.date === targetDate)
  if (dayItems.length === 0) return []
  return buildDayMenus(targetDate, MOCK_MESS_MENU_ITEMS, MOCK_MESS_MEAL_TIMINGS)
}

export function getMockMessMenus(targetDate: string): MessMenu[] {
  const dayMenus = getMockDayMenus(targetDate)
  if (dayMenus.length > 0) {
    return dayMenus.map((dm) => ({
      id: `m-${dm.meal}-${targetDate}`,
      date: targetDate,
      meal: dm.meal,
      items: dm.items.map((i) => i.name),
      start_time: dm.start_time.length === 5 ? `${dm.start_time}:00` : dm.start_time,
      end_time: dm.end_time.length === 5 ? `${dm.end_time}:00` : dm.end_time,
    }))
  }

  // If outside the fixture week, return standard fallback for testing
  return [
    {
      id: `m-bf-${targetDate}`,
      date: targetDate,
      meal: 'breakfast',
      items: ['Idli & Sambar', 'Coconut Chutney', 'White & Brown Bread', 'Butter & Jam', 'Boiled Eggs', 'Masala Tea & Coffee'],
      start_time: '07:30:00',
      end_time: '09:30:00',
    },
    {
      id: `m-lu-${targetDate}`,
      date: targetDate,
      meal: 'lunch',
      items: ['Dal Tadka', 'Jeera Rice', 'Butter Roti', 'Aloo Gobi Matar', 'Chicken Curry', 'Cucumber Raita', 'Fresh Salad'],
      start_time: '12:00:00',
      end_time: '14:30:00',
    },
    {
      id: `m-ht-${targetDate}`,
      date: targetDate,
      meal: 'hi_tea',
      items: ['Samosa (1 pc)', 'Ginger Cardamom Tea / Coffee'],
      start_time: '16:30:00',
      end_time: '18:00:00',
    },
    {
      id: `m-di-${targetDate}`,
      date: targetDate,
      meal: 'dinner',
      items: ['Paneer Butter Masala', 'Phulka Roti', 'Steamed Basmati Rice', 'Dal Makhani', 'Gulab Jamun'],
      start_time: '19:30:00',
      end_time: '21:30:00',
    },
  ]
}

export const MOCK_PROJECTS: Project[] = [
  {
    id: 'p-1',
    course_id: 'c-1',
    title: 'AA-II Predictive Modelling Assignment',
    description: 'Build predictive regression and classification models using python statsmodels & scikit-learn on the provided churn dataset.',
    type: 'assignment',
    group_size: 2,
    deadline: new Date(Date.now() + 86400000 * 2.5).toISOString(),
    submission_link: 'https://forms.gle/sample',
    attachments: [],
    status: 'open',
    program: 'dem',
    batch_year: 2026,
    course: MOCK_COURSES[0],
  },
  {
    id: 'p-2',
    course_id: 'c-10',
    title: 'Platform Business Model Case Analysis',
    description: 'Analyse network effects, multi-homing costs, and monetisation strategy for an emerging digital platform.',
    type: 'project',
    group_size: 4,
    deadline: new Date(Date.now() + 86400000 * 6).toISOString(),
    submission_link: 'https://teams.microsoft.com',
    attachments: [],
    status: 'open',
    program: 'dem',
    batch_year: 2026,
    course: MOCK_COURSES[9],
  },
]

export const MOCK_SUBMISSIONS: InterviewSubmission[] = [
  {
    id: 'sub-1',
    user_id: 'user-demo-1',
    company: 'McKinsey & Company',
    role: 'Digital Consultant Intern',
    round_type: 'Case Interview + Fit',
    interview_date: '2026-09-15',
    questions: '1. Why McKinsey? 2. Market entry strategy for a European EV charging player into India.',
    experience: 'Super structured round. Focus on MECE structuring and clear quantitative math estimation.',
    tips: 'Practice mental math under pressure and articulate assumptions upfront.',
    difficulty: 4,
    outcome: 'Selected',
    is_anonymous: false,
    program: 'dem',
    batch_year: 2026,
    created_at: '2026-09-16T10:00:00Z',
    profile: { full_name: 'Aditi Sharma', avatar_url: null },
  },
]

export const MOCK_INTERVIEWS = MOCK_SUBMISSIONS

export const MOCK_INGEST_ITEMS: IngestItem[] = [
  {
    id: 'item-demo-1',
    batch_id: 'batch-demo-1',
    message_id: 'msg-sample-001@iimu.ac.in',
    raw_text: 'Dear Students,\n\nPlease find attached the problem statement for the AA-II Assignment 1 due on Nov 16 at 23:59 IST.\n\nRegards,\nProf. Debanjan Mitra',
    raw_meta: {
      subject: 'AA-II: Assignment 1 Announcement',
      from: 'debanjan.mitra@iimu.ac.in',
      date: '2026-10-08T09:00:00Z',
      message_id: 'msg-sample-001@iimu.ac.in',
    },
    prefill: {
      itemType: 'assignment',
      title: 'AA-II Assignment 1',
      description: 'Problem statement for AA-II Assignment 1',
      deadline: '2026-11-16T23:59:00+05:30',
      courseCode: 'AA-II',
    },
    item_type: 'assignment',
    status: 'pending',
    error: null,
    created_at: '2026-10-08T09:05:00Z',
  },
]
