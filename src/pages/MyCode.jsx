import BackLink from '../components/BackLink'
import MyCodePanel from '../components/MyCodePanel'
import { useT } from '../utils/lang'

// Your own QR code as a full page. Most buttons open it as a pop-up instead
// (Nov 8, Jade: QrSheet.jsx). This page stays for old links and printed guides.
export default function MyCode() {
  const t = useT()
  return (
    <div className="cal-page mycode-page">
      <BackLink fallback="/me" fallbackLabel={t('My Corner')} />
      <h1 className="mycode-title">{t('My QR code')}</h1>
      <MyCodePanel />
    </div>
  )
}
