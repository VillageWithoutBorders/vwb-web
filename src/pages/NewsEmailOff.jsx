import { Link, useSearchParams } from 'react-router-dom'
import { useT } from '../utils/lang'

// Nov 13: where the "Stop news emails" link in a news email lands (send-news-email
// turns the emails off first, then sends people here). No sign-in needed.
export default function NewsEmailOff() {
  const t = useT()
  const [params] = useSearchParams()
  const trouble = params.get('trouble') === '1'
  return (
    <main className="cal-page wn-off">
      <h1>{trouble ? t('That link did not work') : t('News emails are off')}</h1>
      {trouble ? (
        <p>{t('We could not turn off news emails with that link. Sign in, go to Settings, then Alerts, and turn off Email me VWB news.')}</p>
      ) : (
        <>
          <p>{t('You will not get VWB news emails anymore.')}</p>
          <p>{t('You still get emails about your account, like a new password.')}</p>
          <p>{t('Changed your mind? Sign in, go to Settings, then Alerts, and turn on Email me VWB news.')}</p>
        </>
      )}
      <p><Link to="/settings" className="btn btn-primary">{t('Open Settings')}</Link></p>
    </main>
  )
}
