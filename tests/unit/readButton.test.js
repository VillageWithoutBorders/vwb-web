// "Read this to me" in the full view: off unless switched on, and the pickers on
// screen are told when it changes.
import { describe, expect, it, vi } from 'vitest'
import { applyReadButton, readReadButton } from '../../src/utils/readButton'

function listenForPrefs() {
  const heard = vi.fn()
  window.addEventListener('vwb:prefs', heard)
  return { heard, stop: () => window.removeEventListener('vwb:prefs', heard) }
}

describe('Read this to me button', () => {
  it('is off until the person turns it on', () => {
    expect(readReadButton()).toBe('off')
  })

  it('turning it on is remembered on this phone', () => {
    applyReadButton('on')
    expect(readReadButton()).toBe('on')
  })

  it('turning it off forgets the saved choice', () => {
    applyReadButton('on')
    applyReadButton('off')
    expect(readReadButton()).toBe('off')
    expect(localStorage.getItem('vwb_read_button')).toBeNull()
  })

  it('treats anything that is not "on" as off', () => {
    applyReadButton('on')
    applyReadButton('loud')
    expect(readReadButton()).toBe('off')
    localStorage.setItem('vwb_read_button', 'loud')
    expect(readReadButton()).toBe('off')
  })

  it('tells the screen to re-read its settings every time it changes', () => {
    const { heard, stop } = listenForPrefs()
    applyReadButton('on')
    applyReadButton('off')
    stop()
    expect(heard).toHaveBeenCalledTimes(2)
  })

  it('reads as off when storage is blocked, and still tells the screen', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked') })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked') })
    const { heard, stop } = listenForPrefs()
    expect(readReadButton()).toBe('off')
    expect(() => applyReadButton('on')).not.toThrow()
    stop()
    expect(heard).toHaveBeenCalledTimes(1)
  })
})
