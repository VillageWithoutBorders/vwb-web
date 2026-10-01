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
const Profile = lazyPage(() => import('./pages/Profile'))
const Settings = lazyPage(() => import('./pages/Settings'))
const Help = lazyPage(() => import('./pages/Help'))
const AskForHelp = lazyPage(() => import('./pages/AskForHelp'))
const PostOffer = lazyPage(() => import('./pages/PostOffer'))
const ActiveTasks = lazyPage(() => import('./pages/ActiveTasks'))
const Community = lazyPage(() => import('./pages/Community'))
const CommunityResources = lazyPage(() => import('./pages/CommunityResources'))
const PublicResources = lazyPage(() => import('./pages/PublicResources'))
const OrgPage = lazyPage(() => import('./pages/OrgPage'))
const OrgDashboard = lazyPage(() => import('./pages/OrgDashboard'))
const MfaChallenge = lazyPage(() => import('./pages/MfaChallenge'))
import Conversation from './pages/Conversation'
const MessagesPage = lazyPage(() => import('./pages/Messages'))
const EmergencyEvents = lazyPage(() => import('./pages/EmergencyEvents'))
const CreateEvent = lazyPage(() => import('./pages/CreateEvent'))
const EventDetail = lazyPage(() => import('./pages/EventDetail'))
const Admin = lazyPage(() => import('./pages/Admin'))
const Campfire = lazyPage(() => import('./pages/Campfire'))
const Notifications = lazyPage(() => import('./pages/Notifications'))
const PublicProfile = lazyPage(() => import('./pages/PublicProfile'))
const GrantReport = lazyPage(() => import('./pages/GrantReport'))
import CommunityGuidelines from './pages/CommunityGuidelines'
const JoinOrg = lazyPage(() => import('./pages/JoinOrg'))
const Terms = lazyPage(() => import('./pages/Terms'))
const Calendar = lazyPage(() => import('./pages/Calendar'))
const CalendarEventForm = lazyPage(() => import('./pages/CalendarEventForm'))
const CalendarImport = lazyPage(() => import('./pages/CalendarImport'))
const CalendarEmbed = lazyPage(() => import('./pages/CalendarEmbed'))
const EventPage = lazyPage(() => import('./pages/EventPage'))
const Groups = lazyPage(() => import('./pages/Groups'))
const GroupBoard = lazyPage(() => import('./pages/GroupBoard'))
const JoinGroup = lazyPage(() => import('./pages/JoinGroup'))
const VillageMap = lazy(() => import('./pages/VillageMap'))
import { peekReturnTo } from './utils/returnTo'

// Pages load when first opened, so the first visit downloads less.
// If a new version went out while a tab was open, the old page file is
// gone: reload once to pick up the new version.
function lazyPage(load) {
  return lazy(() =>
    load().then(
      (m) => { try { sessionStorage.removeItem('vwb_chunk_reload') } catch { /* private mode */ } return m },
      (err) => {
        let again = false
        try { again = !sessionStorage.getItem('vwb_chunk_reload'); if (again) sessionStorage.setItem('vwb_chunk_reload', '1') } catch { /* private mode */ }
        if (again) { window.location.reload(); return new Promise(() => {}) }
        throw err
      }
    )
  )
}

function PageLoading() {
  return <div className="cal-page"><p className="cal-empty" role="status">Loading...</p></div>
}

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
    <Suspense fallback={<PageLoading />}>
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
        <Route path="calendar/import" element={<CalendarImport />} />
        <Route path="calendar/:id/edit" element={<CalendarEventForm />} />
        <Route path="groups" element={<Groups />} />
        <Route path="groups/:id" element={<GroupBoard />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </Suspense>
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


