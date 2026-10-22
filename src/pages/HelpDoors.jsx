import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Icon from '../components/Icon'
import { useSimpleView } from '../utils/simpleView'
import { useWaitingOffers } from '../hooks/useWaitingOffers'
import { CAT_ICON_FILES } from '../utils/resourceCategories'
import '../find-help.css'

// The Help tab's front door. Three big doors, resources first:
//   1. Find resources (search plus the most asked-for kinds of help)
//   2. Ask for help
//   3. I can help
// Below them, a small link to your own requests and tasks.

const TOP_KINDS = ['Emergency Help', 'Food', 'Housing', 'Bills and Utilities', 'Health', 'Rides']

export default function HelpDoors() {
  const navigate = useNavigate()
  const simple = useSimpleView()
  const waiting = useWaitingOffers()
  const [search, setSearch] = useState('')

  function runSearch(e) {
    e.preventDefault()
    const q = search.trim()
    navigate('/community/resources' + (q ? '?q=' + encodeURIComponent(q) : ''))
  }

  return (
    <div className={'doors' + (simple ? ' doors-simple' : '')}>
      <h1 className="doors-title">Help</h1>
      <p className="doors-sub">What do you need today?</p>

      {/* Door 1: Find resources */}
      <section className="door door-resources" aria-labelledby="door-res-h">
        <h2 id="door-res-h" className="door-head">
          <span aria-hidden="true" className="door-icon"><Icon name="heart-hands" size={32} /></span>
          Find resources
        </h2>
        <p className="door-desc">Food, housing, bills, rides, and more near you.</p>
        <form className="hub-search" role="search" onSubmit={runSearch}>
          <label htmlFor="doors-search" className="sr-only">Search resources</label>
          <input id="doors-search" type="search" inputMode="search" enterKeyHint="search" autoComplete="off" placeholder="What do you need? (food, rent, rides...)" value={search} onChange={(e) => setSearch(e.target.value)} />
          <button type="submit" className="btn btn-primary">Search</button>
        </form>
        <div className="hub-tiles">
          {TOP_KINDS.map((cat) => (
            <Link key={cat} className="hub-tile" to={'/community/resources?cat=' + encodeURIComponent(cat)}>
              <img className="hub-tile-icon" src={'/art/icons/' + (CAT_ICON_FILES[cat] || 'cat-other') + '.svg'} alt="" width="40" height="40" />
              <span>{cat}</span>
            </Link>
          ))}
        </div>
        <Link to="/community/resources" className="btn btn-outline btn-full door-all">See all resources</Link>
      </section>

      {/* Door 2: Ask for help */}
      <Link to="/ask" className="door door-link">
        <span aria-hidden="true" className="door-icon"><Icon name="raise-hand" size={36} /></span>
        <span className="door-text">
          <span className="door-link-title">Ask for help</span>
          <span className="door-desc">Ask neighbors for a hand. We show nearby resources first.</span>
        </span>
        <span aria-hidden="true" className="door-arrow">&#8250;</span>
      </Link>

      {/* Door 3: I can help */}
      <Link to="/skillshare" className="door door-link">
        <span aria-hidden="true" className="door-icon"><Icon name="heart" size={36} /></span>
        <span className="door-text">
          <span className="door-link-title">I can help</span>
          <span className="door-desc">See what neighbors near you need.</span>
        </span>
        <span aria-hidden="true" className="door-arrow">&#8250;</span>
      </Link>

      <Link to={waiting ? '/tasks?tab=requests' : '/tasks'} className="doors-mine">
        My requests and tasks
        {waiting > 0 && <span className="help-switch-count" aria-label={waiting === 1 ? '1 neighbor offered to help' : waiting + ' neighbors offered to help'}>{waiting > 9 ? '9+' : waiting}</span>}
      </Link>
    </div>
  )
}
