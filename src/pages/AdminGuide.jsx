import { Fragment, useEffect } from 'react'
import BackLink from '../components/BackLink'
import { ADMIN_GUIDE, GUIDE_UPDATED } from '../data/adminGuide'

// The VWB Admin Guide. Open to every signed-in member, so anyone thinking
// about becoming an admin can read it first.

// **bold** inside guide text.
function Rich({ text }) {
  const parts = String(text).split(/(\*\*[^*]+\*\*)/g)
  return parts.map((p, i) => (p.startsWith('**') && p.endsWith('**')
    ? <strong key={i}>{p.slice(2, -2)}</strong>
    : <Fragment key={i}>{p}</Fragment>))
}

function Block({ b }) {
  if (b.p) return <p><Rich text={b.p} /></p>
  if (b.h3) return <h3>{b.h3}</h3>
  if (b.ul) return <ul>{b.ul.map((x) => <li key={x}><Rich text={x} /></li>)}</ul>
  if (b.ol) return <ol>{b.ol.map((x) => <li key={x}><Rich text={x} /></li>)}</ol>
  if (b.table) {
    return (
      <div className="guide-table-wrap" role="region" aria-label="Table" tabIndex={0}>
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
  // Links like /admin-guide#promises open at that section.
  useEffect(() => {
    const id = window.location.hash.slice(1)
    if (!id) return
    const t = setTimeout(() => document.getElementById(id)?.scrollIntoView({ block: 'start' }), 200)
    return () => clearTimeout(t)
  }, [])
  return (
    <article className="admin-guide">
      <BackLink fallback="/profile" fallbackLabel="Back" />
      <h1>VWB Admin Guide</h1>
      <p className="admin-guide-updated">Last updated {GUIDE_UPDATED}</p>
      <nav className="admin-guide-toc" aria-label="In this guide">
        <h2>In this guide</h2>
        <ol>{ADMIN_GUIDE.map((s) => <li key={s.id}><a href={'#' + s.id}>{s.title}</a></li>)}</ol>
      </nav>
      {ADMIN_GUIDE.map((s) => (
        <section key={s.id} id={s.id} aria-labelledby={s.id + '-h'}>
          <h2 id={s.id + '-h'}>{s.title}</h2>
          {s.blocks.map((b, i) => <Block key={i} b={b} />)}
        </section>
      ))}
    </article>
  )
}
