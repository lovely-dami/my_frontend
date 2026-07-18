import { lazy, Suspense } from 'react'
import { useAuth } from './auth/useAuth'
import LoginPage from './pages/LoginPage'

// 역할별 화면은 필요할 때만 내려받는다. 학생이 관리자·선생님 화면 코드까지
// 받을 이유가 없다(로그인 화면은 모두가 먼저 보므로 그대로 둔다).
const StudentPage = lazy(() => import('./pages/StudentPage'))
const TeacherPage = lazy(() => import('./pages/TeacherPage'))
const AdminPage = lazy(() => import('./pages/AdminPage'))
const CommunityDisplayPage = lazy(() => import('./pages/CommunityDisplayPage'))

function FullScreen({ children }) {
  return (
    <div className="min-h-svh flex items-center justify-center bg-emerald-50 text-emerald-700 font-semibold">
      {children}
    </div>
  )
}

// Event-day big screen: open with ?display (or #display). No login required.
function isDisplayMode() {
  return (
    new URLSearchParams(window.location.search).has('display') ||
    window.location.hash.replace('#', '').replace('/', '') === 'display'
  )
}

function roleView(user) {
  switch (user.role) {
    case 'teacher':
      return <TeacherPage />
    case 'admin':
      return <AdminPage />
    case 'student':
    default:
      return <StudentPage />
  }
}

function App() {
  const { user, loading } = useAuth()

  const view = isDisplayMode()
    ? <CommunityDisplayPage />
    : loading ? <FullScreen>🌱 불러오는 중…</FullScreen>
    : !user ? <LoginPage />
    : roleView(user)

  return (
    <Suspense fallback={<FullScreen>🌱 불러오는 중…</FullScreen>}>{view}</Suspense>
  )
}

export default App
