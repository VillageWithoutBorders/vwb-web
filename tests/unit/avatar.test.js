// Avatars are drawn on the phone. Nothing is fetched from an outside website, and a
// made-up avatar address must not be able to sneak anything into the drawing.
import { describe, expect, it } from 'vitest'
import { avatarSrc } from '../../src/utils/avatar'

const DICEBEAR = 'https://api.dicebear.com/7.x/avataaars/svg?'
const isDrawnHere = (src) => src.startsWith('data:image/svg+xml')
const svg = (src) => decodeURIComponent(src.slice(src.indexOf(',') + 1))

describe('avatarSrc with no saved avatar', () => {
  it('draws a plain avatar from the seed, the same one every time', () => {
    const a = avatarSrc(null, 'ruth')
    expect(isDrawnHere(a)).toBe(true)
    expect(svg(a)).toMatch(/^<svg[\s\S]*<\/svg>$/)
    expect(avatarSrc('', 'ruth')).toBe(a)
    expect(avatarSrc(undefined, 'ruth')).toBe(a)
  })

  it('draws different people differently', () => {
    expect(avatarSrc(null, 'ruth')).not.toBe(avatarSrc(null, 'jade'))
  })

  it('still draws something when there is no seed either', () => {
    expect(isDrawnHere(avatarSrc(null, null))).toBe(true)
    expect(avatarSrc(null, undefined)).toBe(avatarSrc(null, 'default'))
  })
})

describe('avatarSrc with a saved DiceBear address', () => {
  it('draws the avatar here instead of handing back the outside address', () => {
    const src = avatarSrc(DICEBEAR + 'seed=ruth&backgroundColor=b6e3f4')
    expect(isDrawnHere(src)).toBe(true)
    expect(src).not.toContain('dicebear.com')
    expect(svg(src)).not.toMatch(/(src|href)="https?:/)
  })

  it('reads the choices out of the address', () => {
    const plain = avatarSrc(DICEBEAR + 'seed=ruth')
    const blue = avatarSrc(DICEBEAR + 'seed=ruth&backgroundColor=b6e3f4')
    expect(svg(blue)).toContain('#b6e3f4')
    expect(svg(plain)).not.toContain('#b6e3f4')
    expect(avatarSrc(DICEBEAR + 'seed=jade')).not.toBe(plain)
    // The older "name[]=" way of listing choices means the same thing.
    expect(avatarSrc(DICEBEAR + 'seed=ruth&backgroundColor[]=b6e3f4')).toBe(blue)
  })

  it('throws away a choice that is not plain letters and numbers', () => {
    const clean = avatarSrc(DICEBEAR + 'seed=ruth')
    const attack = avatarSrc(DICEBEAR + 'seed=ruth&backgroundColor=' + encodeURIComponent('b6e3f4"><script>alert(1)</script>'))
    expect(attack).toBe(clean)
  })

  it('keeps number choices inside sensible limits and drops an empty one', () => {
    const clean = avatarSrc(DICEBEAR + 'seed=ruth')
    expect(avatarSrc(DICEBEAR + 'seed=ruth&rotate=90')).not.toBe(clean)
    expect(avatarSrc(DICEBEAR + 'seed=ruth&rotate=99999')).toBe(avatarSrc(DICEBEAR + 'seed=ruth&rotate=360'))
    expect(avatarSrc(DICEBEAR + 'seed=ruth&rotate=-99999')).toBe(avatarSrc(DICEBEAR + 'seed=ruth&rotate=-360'))
    expect(avatarSrc(DICEBEAR + 'seed=ruth&scale=')).toBe(clean)
  })

  it('draws the plain avatar for a style the app does not carry', () => {
    const src = avatarSrc('https://api.dicebear.com/9.x/bottts/svg?seed=ruth', 'ruth')
    expect(src).toBe(avatarSrc(null, 'ruth'))
  })
})

describe('avatarSrc with any other address', () => {
  it.each([
    'https://example.org/me.png',
    '/art/avatars/owl.webp',
    'https://api.dicebear.com.example.org/7.x/avataaars/svg?seed=ruth',
    'http://api.dicebear.com/7.x/avataaars/svg?seed=ruth',
  ])('hands %s back unchanged for the page\'s own safety rules to judge', (url) => {
    expect(avatarSrc(url, 'ruth')).toBe(url)
  })
})
