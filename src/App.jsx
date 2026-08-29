import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import Layout from './pages/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Feed from './pages/Feed'
import Profile from './pages/Profile'
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

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return null
  return user ? children : <Navigate to="/login" replace />
}

function PublicRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return null
  return user ? <Navigate to="/" replace /> : children
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
      <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
        <Route index element={<Dashboard />} />
        <Route path="skillshare" element={<Feed />} />
        <Route path="tasks" element={<ActiveTasks />} />
        <Route path="profile" element={<Profile />} />
        <Route path="community" element={<Community />} />
        <Route path="help" element={<Help />} />
        <Route path="ask" element={<AskForHelp />} />
        <Route path="post-offer" element={<PostOffer />} />
        <Route path="emergency" element={<EmergencyEvents />} />
        <Route path="emergency/create" element={<CreateEvent />} />
        <Route path="emergency/:id" element={<EventDetail />} />
        <Route path="admin" element={<Admin />} />
        <Route path="campfire" element={<Campfire />} />
        <Route path="conversation/:id" element={<Conversation />} />
        <Route path="messages" element={<MessagesPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  )
}
