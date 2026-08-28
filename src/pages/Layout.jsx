import { Outlet } from 'react-router-dom'
import BottomTabs from '../components/BottomTabs'

export default function Layout() {
  return (
    <div className="app-shell">
      <header className="app-header">
        <img src="/images/vwb_logo.png" alt="Village Without Borders" style={{ height: "36px" }} />
      </header>

      <main className="app-main">
        <Outlet />
      </main>

      <BottomTabs />
    </div>
  )
}
