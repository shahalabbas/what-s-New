import { Routes, Route, useLocation } from 'react-router-dom'
import { AnimatePresence } from 'framer-motion'
import { Toaster } from 'react-hot-toast'
import { useAuth } from './hooks/useAuth'
import { TabBar } from './components/TabBar'
import { InstallBanner } from './components/InstallBanner'
import { LoginScreen } from './features/auth/LoginScreen'
import { BlockedScreen } from './features/auth/BlockedScreen'
import { Dashboard } from './features/dashboard/Dashboard'
import { TimetableScreen } from './features/timetable/TimetableScreen'
import { MessScreen } from './features/mess/MessScreen'
import { ProjectsScreen } from './features/projects/ProjectsScreen'
import { InterviewsScreen } from './features/interviews/InterviewsScreen'
import { AdminScreen } from './features/admin/AdminScreen'

const FEATURE_ASK = import.meta.env.VITE_FEATURE_ASK === 'true'

function LoadingScreen() {
  return (
    <div className="min-h-screen bg-[#FBFBFD] flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="w-16 h-16 bg-gradient-to-tr from-[#0A84FF] to-[#0055B3] rounded-[20px] flex items-center justify-center shadow-[0_8px_24px_rgba(10,132,255,0.28)] border border-white/20 animate-pulse">
          <span className="text-white text-2xl font-extrabold tracking-tight">WN</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-accent animate-ping" />
          <p className="text-xs font-semibold text-[#86868B] uppercase tracking-wider">
            Securing Session...
          </p>
        </div>
      </div>
    </div>
  )
}

export function App() {
  const {
    user,
    loading,
    blockedState,
    isAdmin,
    signInWithGoogle,
    loginWithEmail,
    switchAccount,
  } = useAuth()
  const location = useLocation()

  // 1. Session Restoration Loading State (No protected route flash)
  if (loading) {
    return <LoadingScreen />
  }

  // 2. Blocked Access State (Wrong domain / unapproved cohort)
  if (blockedState.isBlocked) {
    return (
      <BlockedScreen
        attemptedEmail={blockedState.attemptedEmail}
        reason={blockedState.reason}
        onSwitchAccount={switchAccount}
      />
    )
  }

  // 3. Unauthenticated Login Screen
  if (!user) {
    return (
      <LoginScreen
        onLogin={signInWithGoogle}
        onSimulateEmailLogin={loginWithEmail}
        domainError={false}
      />
    )
  }

  // 4. Authenticated PWA Layout
  return (
    <div className="relative min-h-screen bg-surface">
      <Toaster position="top-center" toastOptions={{ duration: 4000 }} />
      <InstallBanner />

      <AnimatePresence mode="wait">
        <Routes location={location} key={location.pathname}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/timetable" element={<TimetableScreen />} />
          <Route path="/mess" element={<MessScreen />} />
          <Route path="/projects" element={<ProjectsScreen />} />
          <Route path="/interviews" element={<InterviewsScreen />} />
          {isAdmin && <Route path="/admin" element={<AdminScreen />} />}
          {FEATURE_ASK && <Route path="/ask" element={<AskPlaceholder />} />}
        </Routes>
      </AnimatePresence>

      <TabBar isAdmin={isAdmin} />
    </div>
  )
}

// Feature-flagged placeholder for future RAG chatbot
function AskPlaceholder() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 pb-tab-bar text-center">
      <div className="text-5xl mb-4">🤖</div>
      <h2 className="text-xl font-bold text-primary-text">AI Assistant</h2>
      <p className="text-sm text-secondary-text mt-2">
        Coming soon — ask anything about your campus, courses, or resources.
      </p>
    </div>
  )
}
