import { Outlet } from 'react-router-dom'
import BottomTabs from '../components/BottomTabs'

export default function Layout() {
  return (
    <div className="app-shell">
      <header className="app-header">
        <a href="https://villagewithoutborders.org" target="_blank" rel="noopener noreferrer"><img src="/images/vwb_header.png" alt="Village Without Borders" style={{ height: "40px", borderRadius: "50%" }} /></a>
      </header>

      <main className="app-main">
        <Outlet />
      </main>

      <BottomTabs />
    </div>
  )
}
