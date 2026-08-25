export default function Help() {
  return (
    <div className="help-page">
      <h1>How can we help?</h1>

      <div className="help-section">
        <h2>About Village Without Borders</h2>
        <p>
          We're a mutual aid network serving Northwest Georgia and the
          Chattanooga Valley. Neighbors helping neighbors with housing,
          disaster recovery, and daily needs.
        </p>
      </div>

      <div className="help-section">
        <h2>How it works</h2>
        <div className="help-steps">
          <div className="help-step">
            <span className="help-step-num">1</span>
            <div>
              <strong>Ask for help</strong>
              <p>Post what you need. Only your name and general area are shared.</p>
            </div>
          </div>
          <div className="help-step">
            <span className="help-step-num">2</span>
            <div>
              <strong>Get matched</strong>
              <p>Hope Ambassadors in your area see the request and reach out.</p>
            </div>
          </div>
          <div className="help-step">
            <span className="help-step-num">3</span>
            <div>
              <strong>Connect directly</strong>
              <p>We put you in touch. No personal info is stored after the match.</p>
            </div>
          </div>
        </div>
      </div>

      <div className="help-section">
        <h2>Your privacy</h2>
        <p>
          We take privacy seriously. Your exact location is never stored.
          Encrypted fields protect your personal information.
          You choose what to share and with whom.
        </p>
      </div>

      <div className="help-section">
        <h2>Need to talk to someone?</h2>
        <p>
          Reach us at{' '}
          <a href="mailto:info@villagewithoutborders.org">
            info@villagewithoutborders.org
          </a>
        </p>
      </div>
    </div>
  )
}
