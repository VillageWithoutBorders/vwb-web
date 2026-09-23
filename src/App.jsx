import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { UnreadCountProvider } from './context/UnreadCountContext'
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

function ProtectedRoute({ children }) {
  const { user, profile, loading, refreshProfile } = useAuth()
  if (loading) return null
  if (!user) return <Navigate to="/login" replace />
  // Wait for the profile row to load before deciding anything, same as the
  // loading check above, so a brand-new signup never flashes real content
  // before we know whether guidelines have been accepted.
  if (!profile) return null
  if (!profile.guidelines_accepted_at) return <CommunityGuidelines onAgree={refreshProfile} />
  return children
}

function PublicRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return null
  return user ? <Navigate to="/" replace /> : children
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/welcome" element={<PublicRoute><Welcome /></PublicRoute>} />
      <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/join-org" element={<JoinOrg />} />
      <Route path="/terms" element={<Terms />} />
      <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
        <Route index element={<Dashboard />} />
        <Route path="skillshare" element={<Feed />} />
        <Route path="tasks" element={<ActiveTasks />} />
        <Route path="profile" element={<Profile />} />
        <Route path="settings" element={<Settings />} />
        <Route path="community" element={<Community />} />
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
          <AppRoutes />
        </UnreadCountProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}


