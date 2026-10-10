import { NavLink, useLocation } from 'react-router-dom'
import { motion } from 'framer-motion'
import { spring } from '../lib/motion'

// Icons (inline SVG for zero-dep)
const HomeIcon = ({ filled }: { filled: boolean }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
    <path
      d="M3 12L12 3L21 12V21H15V15H9V21H3V12Z"
      fill={filled ? '#0A84FF' : 'none'}
      stroke={filled ? '#0A84FF' : '#6E6E73'}
      strokeWidth="1.8"
      strokeLinejoin="round"
    />
  </svg>
)

const CalendarIcon = ({ filled }: { filled: boolean }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
    <rect x="3" y="5" width="18" height="16" rx="3" fill={filled ? '#0A84FF' : 'none'} stroke={filled ? '#0A84FF' : '#6E6E73'} strokeWidth="1.8" />
    <path d="M3 10H21" stroke={filled ? 'white' : '#6E6E73'} strokeWidth="1.8" />
    <path d="M8 3V7M16 3V7" stroke={filled ? '#0A84FF' : '#6E6E73'} strokeWidth="1.8" strokeLinecap="round" />
  </svg>
)

const ForkIcon = ({ filled }: { filled: boolean }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
    <path d="M8 3V7M8 21V11M8 11C8 9 10 7 12 7C14 7 16 9 16 11V21M16 3V7" stroke={filled ? '#0A84FF' : '#6E6E73'} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

const FolderIcon = ({ filled }: { filled: boolean }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
    <path d="M3 7C3 5.89 3.89 5 5 5H10L12 7H19C20.1 7 21 7.9 21 9V19C21 20.1 20.1 21 19 21H5C3.9 21 3 20.1 3 19V7Z"
      fill={filled ? '#0A84FF' : 'none'} stroke={filled ? '#0A84FF' : '#6E6E73'} strokeWidth="1.8" strokeLinejoin="round" />
  </svg>
)

const BriefcaseIcon = ({ filled }: { filled: boolean }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
    <rect x="2" y="8" width="20" height="13" rx="3" fill={filled ? '#0A84FF' : 'none'} stroke={filled ? '#0A84FF' : '#6E6E73'} strokeWidth="1.8" />
    <path d="M16 8V6C16 4.9 15.1 4 14 4H10C8.9 4 8 4.9 8 6V8" stroke={filled ? '#0A84FF' : '#6E6E73'} strokeWidth="1.8" strokeLinecap="round" />
  </svg>
)

const GearIcon = ({ filled }: { filled: boolean }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
    <circle cx="12" cy="12" r="3" stroke={filled ? '#0A84FF' : '#6E6E73'} strokeWidth="1.8" fill={filled ? '#0A84FF' : 'none'} />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" stroke={filled ? '#0A84FF' : '#6E6E73'} strokeWidth="1.8" />
  </svg>
)

const tabs = [
  { path: '/', label: 'Home', Icon: HomeIcon },
  { path: '/timetable', label: 'Schedule', Icon: CalendarIcon },
  { path: '/mess', label: 'Mess', Icon: ForkIcon },
  { path: '/projects', label: 'Projects', Icon: FolderIcon },
  { path: '/placements', label: 'Placements', Icon: BriefcaseIcon },
]

interface TabBarProps {
  isAdmin: boolean
}

export function TabBar({ isAdmin }: TabBarProps) {
  const location = useLocation()
  const visibleTabs = isAdmin
    ? [...tabs, { path: '/admin', label: 'Admin', Icon: GearIcon }]
    : tabs

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-30 bg-white/95 backdrop-blur-md border-t border-border safe-bottom">
      <div className="flex items-center h-16 max-w-md mx-auto px-1">
        {visibleTabs.map((tab) => {
          const isActive = tab.path === '/'
            ? location.pathname === '/'
            : location.pathname.startsWith(tab.path)
          return (
            <NavLink
              key={tab.path}
              to={tab.path}
              className="flex-1 flex flex-col items-center justify-center gap-0.5 py-2 relative"
            >
              {isActive && (
                <motion.div
                  layoutId="tab-indicator"
                  className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-accent rounded-full"
                  transition={spring}
                />
              )}
              <tab.Icon filled={isActive} />
              <span
                className={`text-[10px] font-medium tracking-tight truncate ${
                  isActive ? 'text-accent font-semibold' : 'text-secondary-text'
                }`}
              >
                {tab.label}
              </span>
            </NavLink>
          )
        })}
      </div>
    </nav>
  )
}
