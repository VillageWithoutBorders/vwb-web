// Skins ("Choose your story") change only the look: one skin class on the page at a
// time, and Simple view always shows Home Place while remembering the story picked.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { db } from '../helpers/fakeSupabase.js'
import { activeSkin, applySkinClass, onSkinChange, pickedSkin, saveSkin, setSkinLocal, usePickedSkin, useSkin } from '../../src/utils/skin'

const skinClasses = () => [...document.documentElement.classList].filter((c) => c.startsWith('skin-'))

function simpleView(on) {
  document.documentElement.classList.toggle('simple', on)
  applySkinClass()
}

// The module remembers the picked skin, so put Home Place back after each test.
afterEach(() => {
  document.documentElement.classList.remove('simple')
  setSkinLocal('home')
})

describe('picking a skin on this phone', () => {
  it('is Home Place, with no skin class, until a story is picked', () => {
    expect(activeSkin()).toBe('home')
    expect(pickedSkin()).toBe('home')
    expect(skinClasses()).toEqual([])
  })

  it.each(['space', 'mycelium', 'fairy'])('"%s" puts its one class on the page and is remembered', (name) => {
    setSkinLocal(name)
    expect(activeSkin()).toBe(name)
    expect(skinClasses()).toEqual(['skin-' + name])
    expect(localStorage.getItem('vwb_skin')).toBe(name)
  })

  it('a new skin replaces the old one, never two at once', () => {
    setSkinLocal('space')
    setSkinLocal('fairy')
    expect(skinClasses()).toEqual(['skin-fairy'])
  })

  it('Home Place takes the skin class off and forgets the saved choice', () => {
    setSkinLocal('space')
    setSkinLocal('home')
    expect(skinClasses()).toEqual([])
    expect(localStorage.getItem('vwb_skin')).toBeNull()
  })

  it('a skin VWB does not have is treated as Home Place', () => {
    setSkinLocal('space')
    setSkinLocal('glitter')
    expect(activeSkin()).toBe('home')
    expect(skinClasses()).toEqual([])
    expect(localStorage.getItem('vwb_skin')).toBeNull()
  })

  it('still changes the look when the phone will not save it', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked') })
    expect(() => setSkinLocal('mycelium')).not.toThrow()
    expect(skinClasses()).toEqual(['skin-mycelium'])
  })
})

describe('Simple view always uses Home Place', () => {
  it('hides the skin while Simple view is on, and brings it back after', () => {
    setSkinLocal('space')
    simpleView(true)
    expect(activeSkin()).toBe('home')
    expect(pickedSkin()).toBe('space')
    expect(skinClasses()).toEqual([])
    simpleView(false)
    expect(activeSkin()).toBe('space')
    expect(skinClasses()).toEqual(['skin-space'])
  })

  it('a skin picked while Simple view is on is remembered but not shown', () => {
    simpleView(true)
    setSkinLocal('fairy')
    expect(pickedSkin()).toBe('fairy')
    expect(localStorage.getItem('vwb_skin')).toBe('fairy')
    expect(skinClasses()).toEqual([])
  })
})

describe('saveSkin (this phone and the account)', () => {
  it('changes the look and saves the choice to the account', async () => {
    expect(await saveSkin('space')).toBe(true)
    expect(skinClasses()).toEqual(['skin-space'])
    expect(db.rpcCalls('set_skin').map((c) => c.args)).toEqual([{ p_skin: 'space' }])
  })

  it('never sends the account a skin VWB does not have', async () => {
    await saveSkin('glitter')
    expect(db.rpcCalls('set_skin')[0].args).toEqual({ p_skin: 'home' })
  })

  it('says it was not saved when the account cannot be reached, and keeps the look on this phone', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    db.failNext('set_skin', 'rpc')
    expect(await saveSkin('fairy')).toBe(false)
    expect(skinClasses()).toEqual(['skin-fairy'])
    expect(console.error).toHaveBeenCalled()
  })
})

describe('telling the screen about a change', () => {
  it('onSkinChange hears each change until it is told to stop', () => {
    const heard = vi.fn()
    const stop = onSkinChange(heard)
    setSkinLocal('space')
    expect(heard).toHaveBeenCalledTimes(1)
    stop()
    setSkinLocal('fairy')
    expect(heard).toHaveBeenCalledTimes(1)
  })

  it('useSkin gives the skin on screen now; usePickedSkin gives the choice, even in Simple view', () => {
    const shown = renderHook(() => useSkin())
    const picked = renderHook(() => usePickedSkin())
    expect(shown.result.current).toBe('home')
    act(() => setSkinLocal('mycelium'))
    expect(shown.result.current).toBe('mycelium')
    expect(picked.result.current).toBe('mycelium')
    act(() => simpleView(true))
    expect(shown.result.current).toBe('home')
    expect(picked.result.current).toBe('mycelium')
  })
})

describe('opening the app', () => {
  it('starts with the skin saved on this phone', async () => {
    localStorage.setItem('vwb_skin', 'fairy')
    vi.resetModules()
    const fresh = await import('../../src/utils/skin')
    expect(fresh.pickedSkin()).toBe('fairy')
  })

  it('starts on Home Place when the saved value is not a real skin', async () => {
    localStorage.setItem('vwb_skin', 'glitter')
    vi.resetModules()
    const fresh = await import('../../src/utils/skin')
    expect(fresh.pickedSkin()).toBe('home')
  })

  it('starts on Home Place when storage is blocked', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked') })
    vi.resetModules()
    const fresh = await import('../../src/utils/skin')
    expect(fresh.pickedSkin()).toBe('home')
  })
})
