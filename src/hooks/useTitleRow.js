import { useEffect } from 'react'

// Nov 10 (Jade): every bit of screen matters. On a page with a title near the top,
// the Back arrow sits at the left end of the title's line and the ? sits at the right
// end, instead of Back taking a row of its own and the ? floating over the page.
// If the title is far down, or something to tap sits between Back and the title,
// or something already sits at the right of the title, that part stays as before.
// main: the <main> element. key: changes on every new page. off: chats, maps, setup.

const ACT = 'a[href], button, input, select, textarea, [role="button"], [role="tab"]'
const NEAR = 170
// The ? can sit a little lower: it is better beside a title than floating over the page.
const NEAR_WHAT = 340

function shown(el) {
  const r = el.getBoundingClientRect()
  return r.width > 2 && r.height > 2
}

export function useTitleRow(mainRef, key, off) {
  useEffect(() => {
    const main = mainRef.current
    if (!main) return undefined
    let raf = 0
    let last = ''

    function clear() {
      main.querySelectorAll('[data-tr]').forEach((el) => el.removeAttribute('data-tr'))
      main.querySelectorAll('[data-lead]').forEach((el) => el.removeAttribute('data-lead'))
      main.classList.remove('tr-back', 'tr-what')
      last = ''
    }

    function place() {
      raf = 0
      if (off) { if (last) clear(); return }
      const h1 = [...main.querySelectorAll('h1')].find((h) => shown(h) && !h.closest('[role="dialog"], .sr-only, .convo-header, .tools-sheet'))
      if (!h1) { if (last) clear(); return }
      const mr = main.getBoundingClientRect()
      const ms = getComputedStyle(main)
      const contentTop = mr.top + parseFloat(ms.paddingTop || '0')
      const hr = h1.getBoundingClientRect()
      const hs = getComputedStyle(h1)
      const lineH = parseFloat(hs.lineHeight) || parseFloat(hs.fontSize) * 1.25
      const lineMid = hr.top + parseFloat(hs.paddingTop || '0') + Math.min(lineH, hr.height) / 2
      const near = hr.top - contentTop < NEAR

      // Nov 10 (Jade): the helper sentence right under a page title hides at Larger and
      // Largest (index.css). The ? still explains the page, and screen readers still hear it.
      // Only a short plain sentence: no links or buttons in it, and not on a page with an error.
      let lead = h1.nextElementSibling
      // A title in a small row (with a button beside it): the sentence comes after the row.
      if ((!lead || lead.tagName !== 'P') && h1.parentElement && h1.parentElement !== main && h1.parentElement.children.length <= 3) lead = h1.parentElement.nextElementSibling
      const leadOk = lead && lead.tagName === 'P' && !lead.querySelector('a, button, input') && (lead.textContent || '').trim().length < 220
        && !main.querySelector('[role="alert"]')
      main.querySelectorAll('[data-lead]').forEach((el) => { if (el !== lead || !leadOk) el.removeAttribute('data-lead') })
      if (leadOk && !lead.hasAttribute('data-lead')) lead.setAttribute('data-lead', '')
      const nearWhat = hr.top - contentTop < NEAR_WHAT

      // Back: only the frame's own Back row, alone (Simple view adds Read this to me there).
      const backRow = main.querySelector(':scope > .app-back-row')
      let back = false
      if (near && backRow && backRow.children.length === 1) {
        const between = [...main.querySelectorAll(ACT)].some((el) =>
          !backRow.contains(el) && !h1.contains(el) && !el.closest('.what-btn') && shown(el)
          && (backRow.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING)
          && (el.compareDocumentPosition(h1) & Node.DOCUMENT_POSITION_FOLLOWING))
        back = !between
      }

      // ?: only where it shows (not for a mouse on a big screen), and only when nothing
      // already sits to the right of the title on its line.
      const what = main.querySelector(':scope > .what-btn')
      let whatOk = false
      let rowRight = hr.right
      if (nearWhat && what && getComputedStyle(what).display !== 'none') {
        // The title's line: the nearest box around the title that is about as wide as the page.
        const full = mr.width - parseFloat(ms.paddingLeft || '0') - parseFloat(ms.paddingRight || '0')
        let row = h1.parentElement
        while (row && row !== main && row.getBoundingClientRect().width < full * 0.85) row = row.parentElement
        if (row && row !== main) {
          const rr = row.getBoundingClientRect()
          const rs = getComputedStyle(row)
          rowRight = rr.right - parseFloat(rs.paddingRight || '0')
          const crowded = [...row.querySelectorAll('*')].some((c) => {
            if (h1.contains(c) || c.contains(h1) || c.closest('.what-btn') || !shown(c)) return false
            const cr = c.getBoundingClientRect()
            return cr.left >= hr.right - 54 && cr.top < hr.top + lineH && cr.bottom > hr.top + 2
          })
          whatOk = !crowded
        }
      }

      const sig = [back, whatOk, Math.round(lineMid - mr.top), Math.round(hr.left - mr.left), Math.round(mr.right - rowRight)].join(',')
      if (sig === last && (h1.dataset.tr !== undefined) === (back || whatOk)) return
      main.querySelectorAll('[data-tr]').forEach((el) => { if (el !== h1) el.removeAttribute('data-tr') })
      last = sig
      const parts = [back && 'back', whatOk && 'what'].filter(Boolean)
      if (parts.length) h1.dataset.tr = parts.join(' '); else h1.removeAttribute('data-tr')
      main.classList.toggle('tr-back', back)
      main.classList.toggle('tr-what', whatOk)
      main.style.setProperty('--tr-top', Math.round(lineMid - mr.top - 22) + 'px')
      main.style.setProperty('--tr-left', Math.round(hr.left - mr.left) + 'px')
      main.style.setProperty('--tr-right', Math.round(mr.right - rowRight) + 'px')
    }

    const later = () => { if (!raf) raf = requestAnimationFrame(place) }
    later()
    const mo = new MutationObserver(later)
    mo.observe(main, { childList: true, subtree: true, characterData: true })
    window.addEventListener('resize', later)
    // Fonts and pictures can move the title after the first look.
    const t1 = setTimeout(later, 400)
    const t2 = setTimeout(later, 1500)
    return () => {
      cancelAnimationFrame(raf)
      mo.disconnect()
      window.removeEventListener('resize', later)
      clearTimeout(t1); clearTimeout(t2)
      clear()
    }
  }, [mainRef, key, off])
}
