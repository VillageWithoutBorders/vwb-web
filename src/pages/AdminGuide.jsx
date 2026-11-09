import { Fragment, useEffect } from 'react'
import BackLink from '../components/BackLink'
import { ADMIN_GUIDE, GUIDE_UPDATED } from '../data/adminGuide'
import { ADMIN_GUIDE as GUIDE_ES, GUIDE_UPDATED as UPDATED_ES } from '../data/adminGuide.es'
import { useT, getLang } from '../utils/lang'

// The VWB Admin Guide. Open to every signed-in member, so anyone thinking
// about becoming an admin can read it first.
// Nov 9: in Spanish too (data/adminGuide.es.js), picked by the language setting.

// **bold** inside guide text.
function Rich({ text }) {
  const parts = String(text).split(/(\*\*[^*]+\*\*)/g)
  return parts.map((p, i) => (p.startsWith('**') && p.endsWith('**')
    ? <strong key={i}>{p.slice(2, -2)}</strong>
    : <Fragment key={i}>{p}</Fragment>))
}

function Block({ b, tableLabel }) {
  if (b.p) return <p><Rich text={b.p} /></p>
  if (b.h3) return <h3>{b.h3}</h3>
  if (b.ul) return <ul>{b.ul.map((x) => <li key={x}><Rich text={x} /></li>)}</ul>
  if (b.ol) return <ol>{b.ol.map((x) => <li key={x}><Rich text={x} /></li>)}</ol>
  if (b.table) {
    return (
      <div className="guide-table-wrap" role="region" aria-label={tableLabel} tabIndex={0}>
        <table className="guide-table">
          <thead><tr>{b.table.head.map((h) => <th key={h} scope="col">{h}</th>)}</tr></thead>
          <tbody>
            {b.table.rows.map((r) => (
              <tr key={r[0]}>{r.map((c, i) => (i === 0 ? <th key={i} scope="row">{c}</th> : <td key={i} data-label={b.table.head[i]}>{c}</td>))}</tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }
  return null
}

export default function AdminGuide() {
  const t = useT()
  const es = getLang() === 'es'
  const guide = es ? GUIDE_ES : ADMIN_GUIDE
  // Links like /admin-guide#promises open at that section.
  useEffect(() => {
    const id = window.location.hash.slice(1)
    if (!id) return
    const tm = setTimeout(() => document.getElementById(id)?.scrollIntoView({ block: 'start' }), 200)
    return () => clearTimeout(tm)
  }, [])
  return (
    <article className="admin-guide">
      <BackLink fallback="/profile" fallbackLabel="Back" />
      <h1>{t('VWB Admin Guide')}</h1>
      <p className="admin-guide-updated">{t('Last updated {date}', { date: es ? UPDATED_ES : GUIDE_UPDATED })}</p>
      <nav className="admin-guide-toc" aria-label={t('In this guide')}>
        <h2>{t('In this guide')}</h2>
        <ol>{guide.map((s) => <li key={s.id}><a href={'#' + s.id}>{s.title}</a></li>)}</ol>
      </nav>
      {guide.map((s) => (
        <section key={s.id} id={s.id} aria-labelledby={s.id + '-h'}>
          <h2 id={s.id + '-h'}>{s.title}</h2>
          {s.blocks.map((b, i) => <Block key={i} b={b} tableLabel={t('Table')} />)}
        </section>
      ))}
    </article>
  )
}
