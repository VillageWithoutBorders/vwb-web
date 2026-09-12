import { useState, useLayoutEffect, useRef, useCallback } from 'react'

const EDGE_GAP = 8
// Keeps the menu clear of the app's fixed header and bottom tab bar so a
// flipped-open menu never lands underneath either one.
const TOP_CLEARANCE = 60
const BOTTOM_CLEARANCE = 72

// Gives any "..." options menu a position that's always fully on screen,
// wherever its trigger sits on the page. Render the menu's outer element
// only while open, attach `menuRef` to it, and spread `menuStyle` onto its
// style. Call `openMenu(event)` from the trigger's onClick (pass the click
// event, or a DOMRect directly) - it opens the menu below the trigger, then
// measures the menu's real rendered height and flips it above the trigger
// instead if there isn't room below. Pass 'left' as a second argument to
// left-align instead of the default right-align. One instance of this hook
// covers a whole page/list, since only one such menu is ever open at a time.
export function useMenuPosition(defaultAlign = 'right') {
  const menuRef = useRef(null)
  const [anchor, setAnchor] = useState(null) // trigger's bounding rect, or null when closed
  const [align, setAlign] = useState(defaultAlign)
  const [flip, setFlip] = useState(false)

  const openMenu = useCallback((eventOrRect, alignOverride) => {
    const rect = eventOrRect && eventOrRect.currentTarget
      ? eventOrRect.currentTarget.getBoundingClientRect()
      : eventOrRect
    setFlip(false)
    setAlign(alignOverride || defaultAlign)
    setAnchor(rect)
  }, [defaultAlign])

  const closeMenu = useCallback(() => {
    setAnchor(null)
    setFlip(false)
  }, [])

  // Re-checks whenever the menu's own rendered size changes (not just when it
  // first opens) - so a menu that grows after opening, like a submenu
  // expanding inside it, still gets flipped up if it now runs off the
  // bottom of the screen.
  useLayoutEffect(() => {
    if (!anchor || !menuRef.current) return
    const el = menuRef.current
    const check = () => {
      const menuHeight = el.getBoundingClientRect().height
      const overflowsBelow = anchor.bottom + EDGE_GAP + menuHeight > window.innerHeight - BOTTOM_CLEARANCE
      const fitsAbove = anchor.top - EDGE_GAP - menuHeight >= TOP_CLEARANCE
      if (overflowsBelow && fitsAbove) setFlip(true)
    }
    check()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(check)
    ro.observe(el)
    return () => ro.disconnect()
  }, [anchor])

  let menuStyle = null
  if (anchor) {
    menuStyle = {
      position: 'fixed',
      zIndex: 200,
      maxHeight: `calc(100vh - ${TOP_CLEARANCE + BOTTOM_CLEARANCE}px)`,
      overflowY: 'auto',
    }
    if (flip) {
      menuStyle.bottom = Math.max(BOTTOM_CLEARANCE, window.innerHeight - anchor.top + EDGE_GAP)
    } else {
      menuStyle.top = Math.min(anchor.bottom + EDGE_GAP, Math.max(TOP_CLEARANCE, window.innerHeight - BOTTOM_CLEARANCE))
    }
    if (align === 'right') {
      menuStyle.right = Math.max(EDGE_GAP, window.innerWidth - anchor.right)
    } else {
      menuStyle.left = Math.max(EDGE_GAP, anchor.left)
    }
  }

  return { menuRef, menuStyle, openMenu, closeMenu }
}
