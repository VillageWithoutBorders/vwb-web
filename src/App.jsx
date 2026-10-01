import { lazy, Suspense, useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { UnreadCountProvider } from './context/UnreadCountContext'
import { NotificationsProvider } from './context/NotificationsContext'
import Layout from './pages/Layout'
import Welcome from './pages/Welcome'
import Login from './pages/Login'
import ResetPassword from './pages/ResetPassword'
import Dashboard from './pages/Dashboard'
import Feed from './pages/Feed'
import Profile from './pages/Profile'
import Settings from './pages/Settings'
import Help from './pages/Help'
import AskForHelp from './pages/AskForHelp'
import PostOffer from './pages/PostOffer'
import ActiveTasks from './pages/ActiveTasks'
import Community from './pages/Community'
import CommunityResources from './pages/CommunityResources'
import PublicResources from './pages/PublicResources'
import OrgPage from './pages/OrgPage'
import OrgDashboard from './pages/OrgDashboard'
import MfaChallenge from './pages/MfaChallenge'
import Conversation from './pages/Conversation'
import MessagesPage from './pages/Messages'
import EmergencyEvents from './pages/EmergencyEvents'
import CreateEvent from './pages/CreateEvent'
import EventDetail from './pages/EventDetail'
import Admin from './pages/Admin'
import Campfire from './pages/Campfire'
import Notifications from './pages/Notifications'
import PublicProfile from './pages/PublicProfile'
import GrantReport from './pages/GrantReport'
import CommunityGuidelines from './pages/CommunityGuidelines'
import JoinOrg from './pages/JoinOrg'
import Terms from './pages/Terms'
import Calendar from './pages/Calendar'
import CalendarEventForm from './pages/CalendarEventForm'
import CalendarEmbed from './pages/CalendarEmbed'
import EventPage from './pages/EventPage'
import Groups from './pages/Groups'
import GroupBoard from './pages/GroupBoard'
import JoinGroup from './pages/JoinGroup'
const VillageMap = lazy(() => import('./pages/VillageMap'))
import { peekReturnTo } from './utils/returnTo'

function ProfileWait() {
  const { profileError, retryProfile, signOut } = useAuth()
  const [slow, setSlow] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setSlow(true), 8000)
    return () => clearTimeout(t)
  }, [])
  return (
    <div className="login-page">
      <div className="login-card" role="status" aria-live="polite">
        <div className="login-header">
          <h1>Village Without Borders</h1>
        </div>
        {!profileError && <p className="groups-note">Setting up your account...</p>}
        {(profileError || slow) && (
          <>
            <p className="form-error" role="alert">{profileError || 'This is taking longer than it should.'}</p>
            <button type="button" className="btn btn-primary btn-full" onClick={() => retryProfile()}>Try again</button>
            <button type="button" className="btn btn-outline btn-full" style={{ marginTop: '0.5rem' }} onClick={() => signOut()}>Sign out</button>
          </>
        )}
      </div>
    </div>
  )
}

function ProtectedRoute({ children }) {
  const { user, profile, loading, refreshProfile, mfaRequired } = useAuth()
  if (loading) return null
  if (!user) return <Navigate to="/login" replace />
  // Two-step login: nothing shows until the authenticator code is entered.
  if (mfaRequired === null) return null
  if (mfaRequired) return <MfaChallenge />
  // Wait for the profile row to load before deciding anything, same as the
  // loading check above, so a brand-new signup never flashes real content
  // before we know whether guidelines have been accepted.
  // Never a blank screen: say what's happening, with a way out if it fails.
  if (!profile) return <ProfileWait />
  if (!profile.guidelines_accepted_at) return <CommunityGuidelines onAgree={refreshProfile} />
  return children
}

function PublicRoute({ children }) {
  const { user, loading, mfaRequired } = useAuth()
  if (loading) return null
  if (user && mfaRequired === null) return null
  if (user && mfaRequired) return <MfaChallenge />
  // Someone who signed in from an event page goes back to that event.
  return user ? <Navigate to={peekReturnTo() || '/'} replace /> : children
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/welcome" element={<PublicRoute><Welcome /></PublicRoute>} />
      <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/join-org" element={<JoinOrg />} />
      <Route path="/terms" element={<Terms />} />
      {/* Public on purpose: the resource list is read-only and needs no account, so people of any age can use it. */}
      <Route path="/resources" element={<PublicResources />} />
      {/* Public on purpose: the website calendar and shared event links work without an account. */}
      <Route path="/calendar/embed" element={<CalendarEmbed />} />
      <Route path="/events/:id" element={<EventPage />} />
      <Route path="/groups/join/:token" element={<JoinGroup />} />
      <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
        <Route index element={<Dashboard />} />
        <Route path="skillshare" element={<Feed />} />
        <Route path="tasks" element={<ActiveTasks />} />
        <Route path="profile" element={<Profile />} />
        <Route path="settings" element={<Settings />} />
        <Route path="community" element={<Community />} />
        <Route path="villages" element={<Suspense fallback={<div className="cal-page"><p className="cal-empty">Loading...</p></div>}><VillageMap /></Suspense>} />
        <Route path="community/resources" element={<CommunityResources />} />
        <Route path="orgs/:id" element={<OrgPage />} />
        <Route path="orgs/:id/dashboard" element={<OrgDashboard />} />
        <Route path="org-dashboard" element={<OrgDashboard />} />
        <Route path="help" element={<Help />} />
        <Route path="ask" element={<AskForHelp />} />
        <Route path="post-offer" element={<PostOffer />} />
        <Route path="emergency" element={<EmergencyEvents />} />
        <Route path="emergency/create" element={<CreateEvent />} />
        <Route path="emergency/:id" element={<EventDetail />} />
        <Route path="admin" element={<Admin />} />
        <Route path="admin/report" element={<GrantReport />} />
        <Route path="campfire" element={<Campfire />} />
        <Route path="conversation/:id" element={<Conversation />} />
        <Route path="u/:userId" element={<PublicProfile />} />
        <Route path="messages" element={<MessagesPage />} />
        <Route path="notifications" element={<Notifications />} />
        <Route path="calendar" element={<Calendar />} />
        <Route path="calendar/new" element={<CalendarEventForm />} />
        <Route path="calendar/:id/edit" element={<CalendarEventForm />} />
        <Route path="groups" element={<Groups />} />
        <Route path="groups/:id" element={<GroupBoard />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <UnreadCountProvider>
          <NotificationsProvider>
            <AppRoutes />
          </NotificationsProvider>
        </UnreadCountProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}


