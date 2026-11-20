// Page width: pages stay narrow and calm unless the person picked "Fill the screen".
import { describe, expect, it, vi } from 'vitest'
import { applyWidth, readWidth } from '../../src/utils/pageWidth'

const wide = () => document.documentElement.classList.contains('wide-pages')

describe('page width', () => {
  it('is calm (narrow) until the person picks otherwise', () => {
    expect(readWidth()).toBe('calm')
    expect(wide()).toBe(false)
  })

  it('"full" widens the page and is remembered', () => {
    applyWidth('full')
    expect(wide()).toBe(true)
    expect(readWidth()).toBe('full')
  })

  it('going back to calm narrows the page and forgets the saved choice', () => {
    applyWidth('full')
    applyWidth('calm')
    expect(wide()).toBe(false)
    expect(localStorage.getItem('vwb_width')).toBeNull()
  })

  it('treats anything that is not "full" as calm', () => {
    applyWidth('full')
    applyWidth('enormous')
    expect(wide()).toBe(false)
    expect(readWidth()).toBe('calm')
    localStorage.setItem('vwb_width', 'enormous')
    expect(readWidth()).toBe('calm')
  })

  it('reads as calm when storage is blocked, and still widens the page when asked', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked') })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked') })
    expect(readWidth()).toBe('calm')
    expect(() => applyWidth('full')).not.toThrow()
    expect(wide()).toBe(true)
  })
})
