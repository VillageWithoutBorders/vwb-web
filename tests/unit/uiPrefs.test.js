// Settings that follow you: the account's choices are put on this phone, a value the
// app does not know is ignored, and saving stays quiet if the database part is missing.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { waitFor } from '@testing-library/react'
import { db } from '../helpers/fakeSupabase.js'
import { applyPrefs, devicePrefs, savePrefs } from '../../src/utils/uiPrefs'
import { getLang, setLangLocal } from '../../src/utils/lang'

const DEFAULTS = { text: 'normal', theme: 'auto', motion: 'normal', lang: 'en', width: 'calm', read: 'off' }

function listenForPrefs() {
  const heard = vi.fn()
  window.addEventListener('vwb:prefs', heard)
  return { heard, stop: () => window.removeEventListener('vwb:prefs', heard) }
}

// lang.js remembers the language in the module, so go back to English after each test.
afterEach(async () => {
  await setLangLocal('en')
})

describe('devicePrefs', () => {
  it('reports the plain defaults on a phone with nothing saved', () => {
    expect(devicePrefs()).toEqual(DEFAULTS)
  })
})

describe('applyPrefs (the account wins)', () => {
  it('puts every choice from the account on this phone', async () => {
    applyPrefs({ text: 'larger', theme: 'dark', motion: 'calm', lang: 'es', width: 'full', read: 'on' })
    await waitFor(() => expect(getLang()).toBe('es'))
    expect(devicePrefs()).toEqual({ text: 'larger', theme: 'dark', motion: 'calm', lang: 'es', width: 'full', read: 'on' })
    const root = document.documentElement
    expect(root.classList.contains('text-larger')).toBe(true)
    expect(root.dataset.theme).toBe('dark')
    expect(root.classList.contains('calm-motion')).toBe(true)
    expect(root.classList.contains('wide-pages')).toBe(true)
  })

  it('changes only what the account names, and leaves the rest of this phone alone', () => {
    applyPrefs({ text: 'large', motion: 'calm' })
    applyPrefs({ theme: 'light' })
    expect(devicePrefs()).toEqual({ ...DEFAULTS, text: 'large', motion: 'calm', theme: 'light' })
  })

  it('can turn a choice back to its default', () => {
    applyPrefs({ text: 'largest', theme: 'dark', motion: 'calm', width: 'full', read: 'on' })
    applyPrefs({ text: 'normal', theme: 'auto', motion: 'normal', width: 'calm', read: 'off' })
    expect(devicePrefs()).toEqual(DEFAULTS)
  })

  it('ignores values the app does not know', () => {
    applyPrefs({ text: 'gigantic', theme: 'neon', motion: 'wild', lang: 'fr', width: 'huge', read: 'loud' })
    expect(devicePrefs()).toEqual(DEFAULTS)
    expect(document.documentElement.dataset.theme).toBeUndefined()
  })

  it.each([null, undefined, 'large', 7])('does nothing, and tells nobody, when the account has no settings (%j)', (prefs) => {
    const { heard, stop } = listenForPrefs()
    expect(() => applyPrefs(prefs)).not.toThrow()
    stop()
    expect(devicePrefs()).toEqual(DEFAULTS)
    expect(heard).not.toHaveBeenCalled()
  })

  it('tells the Settings pickers to re-read their choice', () => {
    const { heard, stop } = listenForPrefs()
    applyPrefs({ text: 'large' })
    stop()
    expect(heard).toHaveBeenCalled()
  })

  it('tells the pickers again once the new language has loaded', async () => {
    const { heard, stop } = listenForPrefs()
    applyPrefs({ lang: 'es' })
    const first = heard.mock.calls.length
    await waitFor(() => expect(heard.mock.calls.length).toBeGreaterThan(first))
    stop()
    expect(getLang()).toBe('es')
  })
})

describe('savePrefs', () => {
  it('sends just the changed choices to the account', async () => {
    expect(await savePrefs({ text: 'large' })).toBe(true)
    expect(db.rpcCalls('set_my_ui_prefs').map((c) => c.args)).toEqual([{ p_prefs: { text: 'large' } }])
  })

  it('says not saved, quietly, when the database part is not there yet', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    db.failNext('set_my_ui_prefs', 'rpc', { code: 'PGRST202', message: 'Could not find the function' })
    expect(await savePrefs({ theme: 'dark' })).toBe(false)
    expect(console.error).not.toHaveBeenCalled()
  })

  it('says not saved, and logs it, for any other failure', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    db.failNext('set_my_ui_prefs', 'rpc', { code: '42501', message: 'permission denied' })
    expect(await savePrefs({ theme: 'dark' })).toBe(false)
    expect(console.error).toHaveBeenCalled()
  })
})
