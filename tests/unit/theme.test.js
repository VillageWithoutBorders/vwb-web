// Light or dark: the choice is kept on this phone and put on the page, and a phone
// that blocks storage still gets the look the person picked.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { getTheme, isLight, setTheme } from '../../src/utils/theme'

function addThemeMeta() {
  const meta = document.createElement('meta')
  meta.setAttribute('name', 'theme-color')
  meta.setAttribute('content', '')
  document.head.appendChild(meta)
  return meta
}

function phonePrefersLight(yes) {
  vi.spyOn(window, 'matchMedia').mockImplementation((query) => ({ matches: yes && query === '(prefers-color-scheme: light)', media: query }))
}

afterEach(() => {
  document.head.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.remove())
})

describe('getTheme', () => {
  it('follows the phone until the person picks light or dark', () => {
    expect(getTheme()).toBe('auto')
  })

  it('reads back the choice that was saved', () => {
    setTheme('dark')
    expect(getTheme()).toBe('dark')
  })

  it('falls back to following the phone when storage is blocked', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked') })
    expect(getTheme()).toBe('auto')
  })
})

describe('setTheme', () => {
  it('puts the choice on the page and saves it on this phone', () => {
    setTheme('light')
    expect(document.documentElement.dataset.theme).toBe('light')
    expect(localStorage.getItem('vwb_theme')).toBe('light')
  })

  it('going back to "match the phone" takes the choice off the page and off the phone', () => {
    setTheme('dark')
    setTheme('auto')
    expect(document.documentElement.dataset.theme).toBeUndefined()
    expect(localStorage.getItem('vwb_theme')).toBeNull()
  })

  it('colors the browser bar to match: cream for light, near black for dark', () => {
    const meta = addThemeMeta()
    setTheme('light')
    expect(meta.getAttribute('content')).toBe('#f6efdc')
    setTheme('dark')
    expect(meta.getAttribute('content')).toBe('#1a1a1a')
  })

  it('on "match the phone", colors the browser bar from the phone setting', () => {
    const meta = addThemeMeta()
    phonePrefersLight(true)
    setTheme('auto')
    expect(meta.getAttribute('content')).toBe('#f6efdc')
  })

  it('still changes the page when the phone will not save it', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked') })
    expect(() => setTheme('dark')).not.toThrow()
    expect(document.documentElement.dataset.theme).toBe('dark')
  })
})

describe('isLight', () => {
  it('goes by the picked look when there is one, whatever the phone prefers', () => {
    phonePrefersLight(true)
    setTheme('dark')
    expect(isLight()).toBe(false)
    phonePrefersLight(false)
    setTheme('light')
    expect(isLight()).toBe(true)
  })

  it('goes by the phone when nothing is picked', () => {
    phonePrefersLight(true)
    expect(isLight()).toBe(true)
    phonePrefersLight(false)
    expect(isLight()).toBe(false)
  })
})
