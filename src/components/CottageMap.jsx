import { useEffect } from 'react'
import SpotIcon from './SpotIcon'
import { COTTAGE_SPOTS, GIFT_SPOTS, backgroundSrc, DEFAULT_WORLDS } from '../data/worldElements'
import { useMapBuilder, MapLayers, ToolIcon, sceneProps, zoomLayer, fromSaved, placeLayer } from './MapBuilder'
import '../village-scene.css'
import { useT } from '../utils/lang'
import { skinArt } from '../utils/skinArt'

// Someone else's cottage map, as they arranged it (Nov 1, moved here Nov 7).
// Used by the full map page (/u/:id/cottage) and inside their profile.
// `data` is what get_cottage gave back (ok: true). Places are only pictures.
// Their house calls onHouse (the full page opens their profile with it).
// `preview` (profile on a phone): no zoom button, nothing to tap; the whole map
// is one link drawn by the profile around it.
const BASE = DEFAULT_WORLDS.cottage

export default function CottageMap({ data, name, onHouse, preview = false, className = '' }) {
  const t = useT()
  const b = useMapBuilder({ spots: COTTAGE_SPOTS, base: BASE, initial: null, onSave: () => {} })
  useEffect(() => { b.setWorld(fromSaved(data.layout, BASE)) }, [data]) // eslint-disable-line react-hooks/exhaustive-deps

  const { world, placed, isHidden } = b
  const scene = preview ? { className: 'vs-scene vs-scene-path cv-scene vs-names-' + (world.labels || 'auto') + ' ' + className } : sceneProps(b, 'vs-scene vs-scene-path cv-scene ' + className)
  return (
    <div {...scene}>
      <img className="vs-ground-blur" src={backgroundSrc(world.bg)} alt="" aria-hidden="true" draggable="false" />
      <div {...(preview ? { className: 'vs-zoom' } : zoomLayer(b))}>
        <img className="vs-ground" src={backgroundSrc(world.bg)} alt="" width="720" height="1080" loading={preview ? 'lazy' : undefined} />
        <MapLayers b={b} />
        {/* Garden gifts they have grown (Nov 3, Jade), where they put them. */}
        {GIFT_SPOTS.filter((g) => data.gifts && data.gifts[g.k.slice(5)] && !isHidden(g.k)).map((g0) => {
          const g = placed(g0)
          const style = { left: g.x + '%', top: g.y + '%', '--s': g.s || 1, zIndex: placeLayer(g.z) }
          return <span key={g.k} className="vs-gift" style={style} aria-hidden="true"><img className={'vs-gift-img' + (g.flip ? ' vs-flip' : '')} src={skinArt(g.src)} alt="" width="64" height="64" draggable="false" /></span>
        })}
        {COTTAGE_SPOTS.filter((s0) => !isHidden(s0.k)).map((s0) => {
          const s = placed(s0)
          const style = { left: s.x + '%', top: s.y + '%', '--s': s.s || 1, zIndex: placeLayer(s.z) }
          const pic = <span className={'vs-em' + (s.flip ? ' vs-flip' : '')} aria-hidden="true"><SpotIcon spot={s} painted /></span>
          if (s.k === 'me' && onHouse && !preview) {
            return (
              <button key={s.k} type="button" data-spot={s.k} className="vs-el" style={style} aria-label={t("See {name}'s profile", { name })} onClick={onHouse}>
                {pic}<span className="vs-lab">{name}</span>
              </button>
            )
          }
          return <span key={s.k} className="vs-el cv-still" style={style} aria-hidden="true">{pic}<span className="vs-lab">{s.k === 'me' ? name : t(s.short)}</span></span>
        })}
      </div>
      {!preview && (
        <div className="vs-zoom-fab-wrap" onPointerDown={(e) => e.stopPropagation()}>
          <button type="button" className="vs-zoom-btn vs-zoom-one" aria-pressed={b.zoom.z > 1} onClick={() => (b.zoom.z > 1 ? b.zoomReset() : b.zoomBy(2))}>
            <ToolIcon name={b.zoom.z > 1 ? 'unmagnify' : 'magnify'} /><span>{t(b.zoom.z > 1 ? 'Whole map' : 'Zoom in')}</span>
          </button>
        </div>
      )}
      <div className="vs-fade" />
    </div>
  )
}
