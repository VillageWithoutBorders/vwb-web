import { useT } from '../utils/lang'

// Which database this copy of the app is using. Shown only when the app runs
// on a computer (npm run dev / dev:crn). The deployed app never shows it.
export const ENV_KIND = !import.meta.env.DEV ? null : import.meta.env.MODE === 'crndev' ? 'test' : 'live'

export default function EnvBanner({ compact = false }) {
  const tr = useT()
  if (!ENV_KIND) return null
  const text = ENV_KIND === 'test'
    ? (compact ? 'Importing into the test project (vwb-crn-dev).' : 'Test project (vwb-crn-dev). Nothing here changes the live app.')
    : (compact ? 'Importing into LIVE data. This is real.' : 'Local copy using LIVE data. Changes here are real.')
  return (
    <p role="note" className={'admin-env ' + (ENV_KIND === 'test' ? 'admin-env-test' : 'admin-env-live')}>
      {tr(text)}
    </p>
  )
}
