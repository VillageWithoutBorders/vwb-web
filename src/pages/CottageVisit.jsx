import { useEffect, useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { useAuth } from '../context/AuthContext'
import AvatarDisplay from '../components/AvatarDisplay'
import CottageMap from '../components/CottageMap'
import '../village-scene.css'
import { useT } from '../utils/lang'

// Visit someone's cottage (Nov 1, Jade): /u/:userId/cottage.
// You see their cottage name and how they arranged their map, and nothing else:
// no chats, alerts, counts or lanterns. Places on the map are only pictures.
// Their house opens their profile. Each person chooses who can visit
// (CottageSettings: connections, anyone on VWB, or only me). get_cottage decides.
// Nov 7 (Jade): on a computer their profile shows the cottage beside it, so this
// page sends computers to the profile. Phones open it from the cottage picture there.

export default function CottageVisit() {
  const { userId } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [err, setErr] = useState('')
  const t = useT()
  useEffect(() => {
    if (user && userId === user.id) { navigate('/cottage', { replace: true }); return }
    if (window.matchMedia && window.matchMedia('(min-width: 1024px)').matches) { navigate('/u/' + userId, { replace: true }); return }
    let alive = true
    setData(null); setErr('')
    supabase.rpc('get_cottage', { p_user: userId }).then(({ data: d, error }) => {
      if (!alive) return
      if (error) {
        console.error('Failed to load cottage:', error)
        setErr(t(error.code === 'PGRST202' ? 'Cottage visits need a database update first.' : 'We could not open this cottage. Try again in a moment.'))
        return
      }
      setData(d || { ok: false, why: 'missing' })
    })
    return () => { alive = false }
  }, [userId, user?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const name = (data && data.display_name) || t('This neighbor')
  const title = data && data.ok ? (data.cottage_name || t("{name}'s cottage", { name })) : t('A cottage')

  if (err) return <div className="vs-page vs-page-path cv-page"><p className="vs-error" role="alert">{err}</p></div>
  if (!data) return <div className="vs-page vs-page-path cv-page"><p className="vs-loading" role="status">{t('Opening the cottage...')}</p></div>

  if (!data.ok) {
    return (
      <div className="vs-page vs-page-path cv-page">
        <div className="vs-body cv-closed">
          <h1>{data.why === 'missing' ? t('We could not find this cottage') : t("{name}'s cottage", { name })}</h1>
          <p>{data.why === 'nobody' ? t('{name} keeps their cottage to themselves.', { name })
            : data.why === 'connections' ? t('{name} lets only people they are connected with visit. Once you two are connected, you can visit.', { name })
            : t('It may have moved, or it is not open to you.')}</p>
          {data.why !== 'missing' && <Link className="btn btn-outline btn-full vs-big" to={'/u/' + userId}>{t("See {name}'s profile", { name })}</Link>}
        </div>
      </div>
    )
  }

  return (
    <div className="vs-page vs-page-path cv-page">
      <div className="vs-title">
        <h1>{title}</h1>
        <p className="vs-cottage-sub cv-who">
          <AvatarDisplay url={data.avatar_url} userId={userId} size={28} />
          <span>{data.cottage_name ? t("{name}'s cottage.", { name }) + ' ' : ''}{t('You are visiting.')}</span>
        </p>
      </div>

      <CottageMap data={data} name={name} onHouse={() => navigate('/u/' + userId)} />

      <div className="vs-body">
        <p className="vs-note">{t('This is how {name} arranged their cottage. Their chats, alerts and tasks stay private. Tap their house to see their profile.', { name })}</p>
        {data.gifts && Object.values(data.gifts).some(Boolean) && (
          <p className="vs-note">{t("{name}'s garden: {n} of 4 gifts grown.", { name, n: Object.values(data.gifts).filter(Boolean).length })}</p>
        )}
        <Link className="btn btn-outline btn-full vs-big" to={'/u/' + userId}>{t("See {name}'s profile", { name })}</Link>
      </div>
    </div>
  )
}
