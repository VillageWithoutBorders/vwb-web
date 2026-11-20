// Simple view: bigger words and only the main things. The choice shows on this phone
// right away, follows the account, and always drops back to the Home Place look.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { db } from '../helpers/fakeSupabase.js'
import { isSimpleView, phoneUsesLargeText, saveSimpleView, setSimpleLocal, useSimpleView } from '../../src/utils/simpleView'
import { activeSkin, pickedSkin, setSkinLocal } from '../../src/utils/skin'

const root = document.documentElement

// The modules remember the choice, so put the full view and Home Place back after each test.
afterEach(() => {
  setSimpleLocal(false)
  setSkinLocal('home')
  document.body.style.fontSize = ''
})

describe('Simple view on this phone', () => {
  it('is off until someone turns it on', () => {
    expect(isSimpleView()).toBe(false)
    expect(root.classList.contains('simple')).toBe(false)
  })

  it('turning it on marks the page and is remembered', () => {
    setSimpleLocal(true)
    expect(isSimpleView()).toBe(true)
    expect(root.classList.contains('simple')).toBe(true)
    expect(localStorage.getItem('vwb_simple')).toBe('1')
  })

  it('turning it off clears the page mark and the saved choice', () => {
    setSimpleLocal(true)
    setSimpleLocal(false)
    expect(isSimpleView()).toBe(false)
    expect(root.classList.contains('simple')).toBe(false)
    expect(localStorage.getItem('vwb_simple')).toBeNull()
  })

  it('still switches when the phone will not save it', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked') })
    expect(() => setSimpleLocal(true)).not.toThrow()
    expect(root.classList.contains('simple')).toBe(true)
  })

  it('takes the skin off the page while it is on, and gives it back after', () => {
    setSkinLocal('space')
    setSimpleLocal(true)
    expect(root.classList.contains('skin-space')).toBe(false)
    expect(activeSkin()).toBe('home')
    expect(pickedSkin()).toBe('space')
    setSimpleLocal(false)
    expect(root.classList.contains('skin-space')).toBe(true)
  })

  it('useSimpleView re-draws the screen when it changes', () => {
    const { result } = renderHook(() => useSimpleView())
    expect(result.current).toBe(false)
    act(() => setSimpleLocal(true))
    expect(result.current).toBe(true)
    act(() => setSimpleLocal(false))
    expect(result.current).toBe(false)
  })
})

describe('saveSimpleView (this phone and the account)', () => {
  it('switches this phone and saves a plain yes or no to the account', async () => {
    expect(await saveSimpleView(1)).toBe(true)
    expect(isSimpleView()).toBe(true)
    expect(await saveSimpleView(0)).toBe(true)
    expect(isSimpleView()).toBe(false)
    expect(db.rpcCalls('set_simple_view').map((c) => c.args)).toEqual([{ p_on: true }, { p_on: false }])
  })

  it('says it was not saved when the account cannot be reached, and keeps the choice on this phone', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    db.failNext('set_simple_view', 'rpc')
    expect(await saveSimpleView(true)).toBe(false)
    expect(isSimpleView()).toBe(true)
    expect(console.error).toHaveBeenCalled()
  })
})

describe('opening the app', () => {
  it('starts in Simple view when it was saved on this phone', async () => {
    localStorage.setItem('vwb_simple', '1')
    vi.resetModules()
    const fresh = await import('../../src/utils/simpleView')
    expect(fresh.isSimpleView()).toBe(true)
  })

  it('starts in the full view when storage is blocked', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked') })
    vi.resetModules()
    const fresh = await import('../../src/utils/simpleView')
    expect(fresh.isSimpleView()).toBe(false)
  })
})

describe('phoneUsesLargeText', () => {
  it('is true when the phone draws body text at 19px or bigger', () => {
    document.body.style.fontSize = '19px'
    expect(phoneUsesLargeText()).toBe(true)
    document.body.style.fontSize = '24px'
    expect(phoneUsesLargeText()).toBe(true)
  })

  it('is false at the usual text size', () => {
    document.body.style.fontSize = '16px'
    expect(phoneUsesLargeText()).toBe(false)
  })

  it('is false, without breaking the page, when the size cannot be read', () => {
    vi.spyOn(window, 'getComputedStyle').mockImplementation(() => { throw new Error('no styles') })
    expect(phoneUsesLargeText()).toBe(false)
  })
})
