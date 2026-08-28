export default function Community() {
  return (
    <div className="community-page">
      <h1>Community</h1>
      <p className="feed-subtitle" style={{ marginBottom: '1.5rem' }}>
        Tools for connecting, learning, and building together.
      </p>

      <div className="community-cards">
        <div className="community-card">
          <span className="community-card-icon">??</span>
          <h2>Resource Library</h2>
          <p>Plain-language guides and local resources for housing, flood recovery, mold remediation, FEMA paperwork, and tenant rights.</p>
          <span className="community-coming-soon">Coming soon</span>
        </div>

        <div className="community-card">
          <span className="community-card-icon">??</span>
          <h2>Community Calendar</h2>
          <p>Events, workshops, and meetups from mutual aid partners across the Chattanooga Valley and Northwest Georgia.</p>
          <span className="community-coming-soon">Coming soon</span>
        </div>

        <div className="community-card">
          <span className="community-card-icon">??</span>
          <h2>Feedback</h2>
          <p>Tell us what your community needs. Your input shapes what we build next.</p>
          <span className="community-coming-soon">Coming soon</span>
        </div>
      </div>
    </div>
  )
}
