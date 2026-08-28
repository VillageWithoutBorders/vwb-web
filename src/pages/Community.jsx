export default function Community() {
  return (
    <div className="community-page">
      <h1>Community</h1>
      <p className="feed-subtitle" style={{ marginBottom: '1.5rem' }}>
        Tools for connecting, learning, and building together.
      </p>

      <a href="https://villagewithoutborders.org" target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '1rem', background: 'linear-gradient(135deg, #1a4a3a, #2d5a45)', border: '2px solid #4ecca3', borderRadius: '12px', textDecoration: 'none', marginBottom: '1.5rem' }}>
        <img src="/images/vwb_header.png" alt="VWB" style={{ height: '48px', borderRadius: '50%' }} />
        <div>
          <span style={{ display: 'block', color: '#4ecca3', fontWeight: 700, fontSize: '1rem' }}>Village Without Borders</span>
          <span style={{ color: '#8fc', fontSize: '0.8rem' }}>Visit our website &#8599;</span>
        </div>
      </a>

      <div className="community-cards">
        <div className="community-card">
          <span className="community-card-icon">&#128218;</span>
          <h2>Resource Library</h2>
          <p>Plain-language guides and local resources for housing, flood recovery, mold remediation, FEMA paperwork, and tenant rights.</p>
          <span className="community-coming-soon">Coming soon</span>
        </div>
        <div className="community-card">
          <span className="community-card-icon">&#128197;</span>
          <h2>Community Calendar</h2>
          <p>Events, workshops, and meetups from mutual aid partners across the Chattanooga Valley and Northwest Georgia.</p>
          <span className="community-coming-soon">Coming soon</span>
        </div>
        <div className="community-card">
          <span className="community-card-icon">&#128172;</span>
          <h2>Feedback</h2>
          <p>Tell us what your community needs. Your input shapes what we build next.</p>
          <span className="community-coming-soon">Coming soon</span>
        </div>
      </div>
    </div>
  )
}