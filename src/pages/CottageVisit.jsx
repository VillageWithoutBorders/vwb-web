import { useEffect, useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { useAuth } from '../context/AuthContext'
import SpotIcon from '../components/SpotIcon'
import AvatarDisplay from '../components/AvatarDisplay'
import { COTTAGE_SPOTS, GIFT_SPOTS, backgroundSrc, DEFAULT_WORLDS } from '../data/worldElements'
import { useMapBuilder, MapLayers, ToolIcon, sceneProps, zoomLayer, fromSaved, placeLayer } from '../components/MapBuilder'
import '../village-scene.css'
import { useT } from '../utils/lang'

// Visit someone's cottage (Nov 1, Jade): /u/:userId/cottage.
// You see their cottage name and how they arranged their map, and nothing else:
// no chats, alerts, counts or lanterns. Places on the map are only pictures.
// Their house opens their profile. Each person chooses who can visit
// (CottageSettings: connections, anyone on VWB, or only me). get_cottage decides.
const BASE = DEFAULT_WORLDS.cottage

export default function CottageVisit() {
  const { userId } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [err, setErr] = useState('')
  const t = useT()
  const b = useMapBuilder({ spots: COTTAGE_SPOTS, base: BASE, initial: null, onSave: () => {} })

  useEffect(() => {
    if (user && userId === user.id) { navigate('/cottage', { replace: true }); return }
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
      if (d && d.ok) b.setWorld(fromSaved(d.layout, BASE))
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

  const { world, placed, isHidden } = b
  return (
    <div className="vs-page vs-page-path cv-page">
      <div className="vs-title">
        <h1>{title}</h1>
        <p className="vs-cottage-sub cv-who">
          <AvatarDisplay url={data.avatar_url} userId={userId} size={28} />
          <span>{data.cottage_name ? t("{name}'s cottage.", { name }) + ' ' : ''}{t('You are visiting.')}</span>
        </p>
      </div>

      <div {...sceneProps(b, 'vs-scene vs-scene-path cv-scene')}>
        <img className="vs-ground-blur" src={backgroundSrc(world.bg)} alt="" aria-hidden="true" draggable="false" />
        <div {...zoomLayer(b)}>
          <img className="vs-ground" src={backgroundSrc(world.bg)} alt="" width="720" height="1080" fetchpriority="high" />
          <MapLayers b={b} />
          {/* Garden gifts they have grown (Nov 3, Jade), where they put them. Same rule as
              the visit itself, so anyone who can see the cottage sees its garden. */}
          {GIFT_SPOTS.filter((g) => data.gifts && data.gifts[g.k.slice(5)] && !isHidden(g.k)).map((g0) => {
            const g = placed(g0)
            const style = { left: g.x + '%', top: g.y + '%', '--s': g.s || 1, zIndex: placeLayer(g.z) }
            return <span key={g.k} className="vs-gift" style={style} aria-hidden="true"><img className={'vs-gift-img' + (g.flip ? ' vs-flip' : '')} src={g.src} alt="" width="64" height="64" draggable="false" /></span>
          })}
          {COTTAGE_SPOTS.filter((s0) => !isHidden(s0.k)).map((s0) => {
            const s = placed(s0)
            const style = { left: s.x + '%', top: s.y + '%', '--s': s.s || 1, zIndex: placeLayer(s.z) }
            const pic = <span className={'vs-em' + (s.flip ? ' vs-flip' : '')} aria-hidden="true"><SpotIcon spot={s} painted /></span>
            // Their house is the one place you can tap: it opens their profile.
            if (s.k === 'me') {
              return (
                <button key={s.k} type="button" data-spot={s.k} className="vs-el" style={style} aria-label={t("See {name}'s profile", { name })} onClick={() => navigate('/u/' + userId)}>
                  {pic}<span className="vs-lab">{name}</span>
                </button>
              )
            }
            return <span key={s.k} className="vs-el cv-still" style={style} aria-hidden="true">{pic}<span className="vs-lab">{t(s.short)}</span></span>
          })}
        </div>
        <div className="vs-zoom-fab-wrap" onPointerDown={(e) => e.stopPropagation()}>
          <button type="button" className="vs-zoom-btn vs-zoom-one" aria-pressed={b.zoom.z > 1} onClick={() => (b.zoom.z > 1 ? b.zoomReset() : b.zoomBy(2))}>
            <ToolIcon name={b.zoom.z > 1 ? 'unmagnify' : 'magnify'} /><span>{t(b.zoom.z > 1 ? 'Whole map' : 'Zoom in')}</span>
          </button>
        </div>
        <div className="vs-fade" />
      </div>

      <div className="vs-body">
        <p className="vs-note">{t('This is how {name} arranged their cottage. Their chats, alerts and tasks stay private. Tap their house to see their profile.', { name })}</p>
        {data.gifts && Object.values(data.gifts).some(Boolean) && (
          <p className="vs-note">{t("{name}'s garden: {n} of 4 gifts grown.", { name, n: Object.values(data.gifts).filter(Boolean).length })}</p>
        )}
        <Link className="btn btn-outline btn-full vs-big" to={'/u/' + userId}>{t("See {name}'s profile", { name })}</Link>
        <Link className="btn btn-outline btn-full vs-big" to="/cottage">{t('Back to my cottage')}</Link>
      </div>
    </div>
  )
}
