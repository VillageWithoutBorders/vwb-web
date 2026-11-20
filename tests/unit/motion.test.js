// Calm motion: moving pictures stop when VWB's own switch is on or when the phone
// itself asks for less motion.
import { describe, expect, it, vi } from 'vitest'
import { applyCalm, calmMotion, readCalm } from '../../src/utils/motion'

function phoneAsksForLessMotion(yes) {
  vi.spyOn(window, 'matchMedia').mockImplementation((query) => ({ matches: yes && query === '(prefers-reduced-motion: reduce)', media: query }))
}

describe('calmMotion', () => {
  it('is off when neither VWB nor the phone asks for less motion', () => {
    phoneAsksForLessMotion(false)
    expect(calmMotion()).toBe(false)
  })

  it('is on when the VWB switch is on, even if the phone does not ask', () => {
    phoneAsksForLessMotion(false)
    applyCalm(true)
    expect(calmMotion()).toBe(true)
  })

  it('is on when the phone asks for less motion, even with the VWB switch off', () => {
    phoneAsksForLessMotion(true)
    expect(calmMotion()).toBe(true)
  })

  it('is off, without breaking the page, when the phone cannot be asked', () => {
    vi.spyOn(window, 'matchMedia').mockImplementation(() => { throw new Error('no matchMedia') })
    expect(calmMotion()).toBe(false)
  })
})

describe('applyCalm and readCalm', () => {
  it('turning it on marks the page and remembers it on this phone', () => {
    applyCalm(true)
    expect(document.documentElement.classList.contains('calm-motion')).toBe(true)
    expect(readCalm()).toBe(true)
  })

  it('turning it off clears the page mark and the saved choice', () => {
    applyCalm(true)
    applyCalm(false)
    expect(document.documentElement.classList.contains('calm-motion')).toBe(false)
    expect(readCalm()).toBe(false)
    expect(localStorage.getItem('vwb_motion')).toBeNull()
  })

  it('reads as off when storage is blocked', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked') })
    expect(readCalm()).toBe(false)
  })

  it('still calms the page when the phone will not save it', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked') })
    expect(() => applyCalm(true)).not.toThrow()
    expect(calmMotion()).toBe(true)
  })
})
