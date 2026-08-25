import { Outlet } from 'react-router-dom'
import BottomTabs from '../components/BottomTabs'

export default function Layout() {
  return (
    <div className="app-shell">
      <header className="app-header">
        <h1 className="app-title">VWB</h1>
      </header>

      <main className="app-main">
        <Outlet />
      </main>

      <BottomTabs />
    </div>
  )
}
