// ─── Shared TypeScript Interfaces ────────────────────────────────────────────

export type SessionType = 'lecture' | 'tutorial'
export type SessionStatus = 'scheduled' | 'cancelled' | 'rescheduled'
export type OverrideAction = 'cancelled' | 'rescheduled' | 'extra'
export type MealType = 'breakfast' | 'lunch' | 'hi_tea' | 'dinner' | 'snacks'
export type DietType = 'veg' | 'egg' | 'non_veg'
export type ProjectType = 'assignment' | 'project' | 'end-term'
export type ProjectStatus = 'open' | 'submitted' | 'graded'
export type UserRole = 'student' | 'admin'

export type IngestBatchKind = 'timetable' | 'mess' | 'email'
export type IngestBatchSource = 'upload' | 'paste' | 'gmail'
export type IngestBatchStatus = 'pending_review' | 'applied' | 'rejected' | 'rolled_back' | 'failed'
export type IngestItemType = 'assignment' | 'project' | 'placement_event' | 'meeting' | 'notice' | 'other'
export type IngestItemStatus = 'pending' | 'approved' | 'rejected'
export type EventType =
  | 'exam'
  | 'quiz'
  | 'holiday'
  | 'campus_event'
  | 'industry_talk'
  | 'workshop'
  | 'placement'
  | 'assignment'
  | 'doubt_session'
  | 'guest_session'
  | 'event'
  | 'meeting'
  | 'notice'
  | 'placement_event'

export interface AllowedCohort {
  id: string
  program: string
  batch_year: number
  display_name: string
  is_active: boolean
}

export interface Profile {
  id: string
  email: string | null
  full_name: string | null
  avatar_url: string | null
  program: string
  batch_year: number
  role: UserRole
  created_at: string
}

export interface Term {
  id: string
  term_key: string
  program: string
  batch_year: number
  term_name: string
  start_date: string // "YYYY-MM-DD"
  end_date: string   // "YYYY-MM-DD"
  default_venue: string | null
  updated_as_on: string | null
  source_batch_id?: string | null
  created_at?: string
}

export interface Course {
  id: string
  code: string
  name: string
  faculty: string | null
  color_tag: string
  grid_label?: string | null
  credits: number
  total_sessions?: number | null
  program?: string
  batch_year?: number
}

export interface ClassSession {
  id: string
  term_id?: string | null
  program: string
  batch_year: number
  date: string       // "YYYY-MM-DD"
  start_time: string // "HH:MM" or "HH:MM:SS"
  end_time: string   // "HH:MM" or "HH:MM:SS"
  course_id: string | null
  session_no?: number | null
  faculty?: string | null
  room: string | null
  session_type: SessionType
  status: SessionStatus
  note?: string | null
  raw_text?: string | null
  source_batch_id?: string | null
  updated_by?: string | null
  updated_at?: string
  course?: Course
  term?: Term
}

export interface ResolvedSession {
  id: string
  course_id: string
  course?: Course
  start_time: string  // "HH:MM"
  end_time: string
  room: string | null
  session_type: string
  status?: SessionStatus
  session_no?: number | null
  note?: string | null
  is_extra?: boolean
  override_action?: OverrideAction
}

export interface MessMenu {
  id: string
  date: string
  meal: MealType
  items: string[]
  start_time: string
  end_time: string
  source_batch_id?: string | null
}

export interface Project {
  id: string
  course_id: string | null
  title: string
  description: string | null
  type: ProjectType
  group_size: number
  deadline: string   // ISO timestamptz
  submission_link: string | null
  attachments: string[]
  status: ProjectStatus
  program?: string
  batch_year?: number
  source_item_id?: string | null
  course?: Course
}

export interface InterviewSubmission {
  id: string
  user_id: string | null
  company: string
  role: string
  round_type: string | null
  interview_date: string | null
  questions: string | null
  experience: string | null
  tips: string | null
  difficulty: number | null
  outcome: string | null
  is_anonymous: boolean
  program?: string
  batch_year?: number
  created_at: string
  profile?: {
    full_name: string | null
    avatar_url: string | null
  }
}

export interface IngestBatch {
  id: string
  kind: IngestBatchKind
  source: IngestBatchSource
  file_path: string | null
  status: IngestBatchStatus
  created_by: string | null
  created_at: string
  applied_at: string | null
  summary: Record<string, any>
  snapshot?: Record<string, any>
}

export interface IngestItem {
  id: string
  batch_id: string
  message_id: string | null
  raw_text: string
  raw_meta: {
    subject?: string
    from?: string
    date?: string
    message_id?: string
    [key: string]: any
  }
  prefill: Record<string, any>
  item_type: IngestItemType
  status: IngestItemStatus
  error: string | null
  created_at: string
}

export interface CampusEvent {
  id: string
  term_id?: string | null
  program: string
  batch_year: number
  type: EventType
  title: string
  description?: string | null
  date: string       // "YYYY-MM-DD"
  start_at?: string | null   // ISO timestamptz
  end_at?: string | null
  start_time?: string | null // "HH:MM"
  end_time?: string | null   // "HH:MM"
  all_day: boolean
  course_id?: string | null
  course_code?: string | null
  status: SessionStatus
  venue?: string | null
  link?: string | null
  company?: string | null
  note?: string | null
  raw_text?: string | null
  source_item_id?: string | null
  source_batch_id?: string | null
  created_at?: string
  course?: Course
}

export type DiffStatus = 'added' | 'modified' | 'removed' | 'unchanged'

export interface DiffItem<T> {
  status: DiffStatus
  current?: T
  incoming?: T
  changes?: string[]
}

export interface CourseProgress {
  course_id: string
  program?: string
  batch_year?: number
  course_code: string
  course_name: string
  faculty: string | null
  color_tag: string
  credits: number
  total_sessions: number
  completed_sessions: number
  scheduled_sessions: number
  remaining_sessions: number
  percent_complete: number
  current_session_no?: number | null
  next_session_date: string | null
  next_session_no: number | null
  exam_date: string | null
}

export interface CourseAuditSummary {
  code: string
  name: string
  faculty: string | null
  credits: number
  totalExpected: number
  scheduledCount: number
  cancelledCount: number
  status: 'ok' | 'warning' | 'error'
}

export interface FlatTimetableParseResult {
  terms: Term[]
  courses: Course[]
  class_sessions: ClassSession[]
  events: CampusEvent[]
  mess_menu?: MessMenu[]
  auditSummary: CourseAuditSummary[]
  warnings: string[]
  errors: string[]
}

export interface MessWeek {
  id: string
  week_key: string
  week_start: string // YYYY-MM-DD
  week_end: string   // YYYY-MM-DD
  title: string
  source_batch_id?: string | null
  created_at?: string
}

export interface MessMenuItem {
  id: string
  week_id?: string
  week_key?: string
  date: string       // YYYY-MM-DD
  day?: string
  meal: MealType
  position: number
  item_raw: string
  item_display: string
  category?: string | null
  diet: DietType
  is_special: boolean
  note?: string | null
  fix_note?: string | null
  source_batch_id?: string | null
  created_at?: string
}

export interface MessMealTiming {
  id: string
  meal: MealType
  label: string
  applies_to: 'all' | 'weekday' | 'weekend'
  start_time: string // HH:MM or HH:MM:SS
  end_time: string   // HH:MM or HH:MM:SS
  effective_from: string // YYYY-MM-DD
  created_at?: string
}

export interface MessMenuDayItem {
  position: number
  name: string
  raw: string
  category?: string | null
  diet: DietType
  is_special: boolean
  note?: string | null
}

export type MessMenuItemFormatted = MessMenuDayItem
export type MessMenuDiffItem = DiffItem<MessMenuItem>

export interface MessMenuDay {
  date: string
  meal: MealType
  label: string
  start_time: string
  end_time: string
  items: MessMenuDayItem[]
  has_non_veg: boolean
  has_special: boolean
}

export interface MessSpellingFix {
  date?: string
  meal?: MealType
  raw: string
  display: string
  count?: number
}

export interface MessDayAudit {
  date: string
  day: string
  dayName?: string
  breakfast: number
  lunch: number
  hi_tea: number
  dinner: number
  total: number
  non_veg: number
  specials: number
  breakfastCount?: number
  lunchCount?: number
  hiTeaCount?: number
  dinnerCount?: number
  totalItems?: number
  eggOrNonVegCount?: number
  specialsCount?: number
}

export type MessDaySummary = MessDayAudit

export interface FlatMessMenuParseResult {
  mess_weeks: MessWeek[]
  mess_menu_items: MessMenuItem[]
  mess_meal_timings: MessMealTiming[]
  weeks: MessWeek[]
  items: MessMenuItem[]
  timings: MessMealTiming[]
  auditSummary: MessDayAudit[]
  daySummaries: MessDayAudit[]
  spellingFixes: MessSpellingFix[]
  warnings: string[]
  errors: string[]
}
