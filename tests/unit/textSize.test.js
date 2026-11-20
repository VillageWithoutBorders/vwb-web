// Text size: one size class on the page at a time, remembered on this phone,
// and anything unknown falls back to normal.
import { describe, expect, it, vi } from 'vitest'
import { applyTextSize, readTextSize } from '../../src/utils/textSize'

const sizeClasses = () => [...document.documentElement.classList].filter((c) => c.startsWith('text-'))

describe('readTextSize', () => {
  it('is normal when nothing is saved', () => {
    expect(readTextSize()).toBe('normal')
  })

  it('is normal when the saved value is not a real size', () => {
    localStorage.setItem('vwb_text', 'gigantic')
    expect(readTextSize()).toBe('normal')
  })

  it('is normal when storage is blocked', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked') })
    expect(readTextSize()).toBe('normal')
  })
})

describe('applyTextSize', () => {
  it.each(['large', 'larger', 'largest'])('puts only the "%s" class on the page and remembers it', (size) => {
    applyTextSize(size)
    expect(sizeClasses()).toEqual(['text-' + size])
    expect(readTextSize()).toBe(size)
  })

  it('swaps the old size class for the new one', () => {
    applyTextSize('large')
    applyTextSize('largest')
    expect(sizeClasses()).toEqual(['text-largest'])
  })

  it('normal takes the size class off and forgets the saved size', () => {
    applyTextSize('larger')
    applyTextSize('normal')
    expect(sizeClasses()).toEqual([])
    expect(localStorage.getItem('vwb_text')).toBeNull()
  })

  it('treats an unknown size as normal', () => {
    applyTextSize('large')
    applyTextSize('gigantic')
    expect(sizeClasses()).toEqual([])
    expect(localStorage.getItem('vwb_text')).toBeNull()
  })

  it('still changes the page when the phone will not save it', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked') })
    expect(() => applyTextSize('largest')).not.toThrow()
    expect(sizeClasses()).toEqual(['text-largest'])
  })
})
