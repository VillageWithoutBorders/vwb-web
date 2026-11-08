import { Component } from 'react'
import { t } from '../utils/lang'
import { reloadFresh } from '../utils/freshApp'

// Nov 7 (Jade): if a page breaks, show a calm note with a button instead of a blank screen.
// Most often it is a screen file from before an update; the button loads the new version.
export default class PageErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null, busy: false }
  }

  static getDerivedStateFromError(error) { return { error } }

  componentDidCatch(error, info) { console.error('[PageErrorBoundary]', error, info && info.componentStack) }

  componentDidUpdate(prev) {
    // Moving to another page clears the note.
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null })
  }

  render() {
    if (!this.state.error) return this.props.children
    const chunk = /dynamically imported module|Importing a module script failed|Failed to fetch|Loading chunk|MIME type/i.test(String(this.state.error && this.state.error.message))
    return (
      <div className="cal-page page-error" role="alert">
        <h1>{t(chunk ? 'VWB was just updated' : 'This page had a problem')}</h1>
        <p>{t(chunk ? 'Tap the button to open the newest version. Nothing you saved is lost.' : 'Tap the button to try again. If it keeps happening, tell us in App guide and feedback.')}</p>
        <button type="button" className="btn btn-primary btn-full" disabled={this.state.busy} onClick={() => { this.setState({ busy: true }); reloadFresh() }}>
          {t(this.state.busy ? 'Loading...' : chunk ? 'Open the newest version' : 'Try again')}
        </button>
      </div>
    )
  }
}
