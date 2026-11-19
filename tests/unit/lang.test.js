// Language: words show in Spanish for people who pick it, anything not translated yet
// shows in English (never blank), and people's own words (names, messages) are never changed.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'

// A small Spanish word list, so these tests do not break when a translator improves a word.
const CORE = {
  'Good morning': 'Buenos días',
  'Hi, {name}': 'Hola, {name}',
  'Food and Meals': 'Comida',
  '{n} new': '{n} nuevos',
  'World': 'Mundo',
  'My Corner': 'Mi rincón',
  'Tap My Village at the top.': 'Toque Mi aldea arriba.',
}
const MORE = {
  'A neighbor': 'Un vecino',
  'Yard work': 'Trabajo de jardín',
  'New message': 'Mensaje nuevo',
  '{name} wants to connect': '{name} quiere conectarse',
  '{name} offered to help with {skill}': '{name} se ofreció a ayudar con {skill}',
  '{name} joined {group}': '{name} se unió a {group}',
  '{name} joined your village': '{name} se unió a su aldea',
}

// lang.js and skin.js remember the choice in the module itself, so each test loads fresh copies.
async function load({ core = () => ({ default: CORE }), more = () => ({ default: MORE }) } = {}) {
  vi.resetModules()
  vi.doMock('../../src/data/es.js', core)
  vi.doMock('../../src/data/es-more.js', more)
  const lang = await import('../../src/utils/lang')
  const skin = await import('../../src/utils/skin')
  return { ...lang, ...skin }
}

// Spanish with both word lists in (the second list arrives a moment after the first).
async function loadSpanish() {
  const m = await load()
  await m.setLangLocal('es')
  await waitFor(() => expect(m.t('A neighbor')).toBe('Un vecino'))
  return m
}

afterEach(() => {
  vi.doUnmock('../../src/data/es.js')
  vi.doUnmock('../../src/data/es-more.js')
})

describe('English (the starting language)', () => {
  it('shows the words as written', async () => {
    const { t, getLang } = await load()
    expect(getLang()).toBe('en')
    expect(t('Good morning')).toBe('Good morning')
  })

  it('fills every {spot} with the value given, numbers too', async () => {
    const { t } = await load()
    expect(t('Hi, {name}', { name: 'Ruth' })).toBe('Hi, Ruth')
    expect(t('{n} of {n} for {who}', { n: 3, who: 'Sam' })).toBe('3 of 3 for Sam')
  })

  it('leaves alerts exactly as the database wrote them', async () => {
    const { tAlert } = await load()
    expect(tAlert('Ruth wants to connect')).toBe('Ruth wants to connect')
  })
})

describe('choosing a language', () => {
  it('Spanish is saved on this phone, marked on the page, and used for words', async () => {
    const { setLangLocal, getLang, t } = await load()
    await setLangLocal('es')
    expect(getLang()).toBe('es')
    expect(localStorage.getItem('vwb_lang')).toBe('es')
    expect(document.documentElement.lang).toBe('es')
    expect(t('Good morning')).toBe('Buenos días')
    expect(t('Hi, {name}', { name: 'Ruth' })).toBe('Hola, Ruth')
  })

  it('words that are not translated yet show in English, never blank', async () => {
    const { setLangLocal, t } = await load()
    await setLangLocal('es')
    expect(t('A brand new button')).toBe('A brand new button')
  })

  it('an older skill name written with "&" finds the same Spanish as the "and" spelling', async () => {
    const { setLangLocal, t } = await load()
    await setLangLocal('es')
    expect(t('Food & Meals')).toBe('Comida')
  })

  it('going back to English forgets the saved choice and shows English again', async () => {
    const { setLangLocal, getLang, t } = await load()
    await setLangLocal('es')
    await setLangLocal('en')
    expect(getLang()).toBe('en')
    expect(localStorage.getItem('vwb_lang')).toBeNull()
    expect(document.documentElement.lang).toBe('en')
    expect(t('Good morning')).toBe('Good morning')
  })

  it('a language VWB does not have yet is treated as English', async () => {
    const { setLangLocal, getLang, t } = await load()
    await setLangLocal('fr')
    expect(getLang()).toBe('en')
    expect(localStorage.getItem('vwb_lang')).toBeNull()
    expect(t('Good morning')).toBe('Good morning')
  })

  it('still switches when the phone will not save the choice', async () => {
    const { setLangLocal, t } = await load()
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked') })
    await setLangLocal('es')
    expect(t('Good morning')).toBe('Buenos días')
  })
})

describe('opening the app', () => {
  it('starts in Spanish when Spanish was saved on this phone', async () => {
    localStorage.setItem('vwb_lang', 'es')
    const { startLang, getLang, t } = await load()
    await startLang()
    expect(getLang()).toBe('es')
    expect(t('Good morning')).toBe('Buenos días')
  })

  it('starts in English, without loading any Spanish, when nothing was saved', async () => {
    const core = vi.fn(() => ({ default: CORE }))
    const { startLang, getLang } = await load({ core })
    await startLang()
    expect(getLang()).toBe('en')
    expect(core).not.toHaveBeenCalled()
  })

  it('starts in English when storage is blocked', async () => {
    const { startLang, getLang } = await load()
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked') })
    await startLang()
    expect(getLang()).toBe('en')
  })
})

describe('the Spanish words load in two parts', () => {
  it('the first screens are in Spanish right away, and the rest follows without being asked', async () => {
    let arrive
    const gate = new Promise((resolve) => { arrive = resolve })
    const { setLangLocal, t } = await load({ more: async () => { await gate; return { default: MORE } } })
    await setLangLocal('es')
    expect(t('Good morning')).toBe('Buenos días')
    expect(t('A neighbor')).toBe('A neighbor')
    arrive()
    await waitFor(() => expect(t('A neighbor')).toBe('Un vecino'))
    expect(t('Good morning')).toBe('Buenos días')
  })

  it('stays in English when the late Spanish words arrive after the person went back to English', async () => {
    let arrive
    const gate = new Promise((resolve) => { arrive = resolve })
    const { setLangLocal, getLang, t } = await load({ more: async () => { await gate; return { default: MORE } } })
    await setLangLocal('es')
    await setLangLocal('en')
    arrive()
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(getLang()).toBe('en')
    expect(t('A neighbor')).toBe('A neighbor')
    expect(t('Good morning')).toBe('Good morning')
  })

  it('stays readable in English when the Spanish words cannot load (no signal)', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { setLangLocal, t } = await load({ core: () => { throw new Error('offline') } })
    await expect(setLangLocal('es')).resolves.toBeUndefined()
    expect(t('Good morning')).toBe('Good morning')
    expect(t('Hi, {name}', { name: 'Ruth' })).toBe('Hi, Ruth')
    expect(console.error).toHaveBeenCalled()
    // The choice is kept, so Spanish can load the next time the app opens.
    expect(localStorage.getItem('vwb_lang')).toBe('es')
  })

  it('keeps the first screens in Spanish when only the second part fails to load', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { setLangLocal, t } = await load({ more: () => { throw new Error('offline') } })
    await setLangLocal('es')
    await waitFor(() => expect(console.error).toHaveBeenCalled())
    expect(t('Good morning')).toBe('Buenos días')
    expect(t('A neighbor')).toBe('A neighbor')
  })
})

describe('tAlert (alerts the database wrote in English)', () => {
  it('uses the Spanish for an alert that matches word for word', async () => {
    const { tAlert } = await loadSpanish()
    expect(tAlert('New message')).toBe('Mensaje nuevo')
  })

  it('translates the words around a name and leaves the name alone', async () => {
    const { tAlert } = await loadSpanish()
    expect(tAlert('Ruth wants to connect')).toBe('Ruth quiere conectarse')
  })

  it('does not translate a name even when it happens to be a word VWB knows', async () => {
    const { tAlert } = await loadSpanish()
    expect(tAlert('Yard work wants to connect')).toBe('Yard work quiere conectarse')
  })

  it('translates the stand-in the database uses when a name is missing', async () => {
    const { tAlert } = await loadSpanish()
    expect(tAlert('A neighbor wants to connect')).toBe('Un vecino quiere conectarse')
  })

  it('translates a skill inside the alert', async () => {
    const { tAlert } = await loadSpanish()
    expect(tAlert('Ruth offered to help with Yard work')).toBe('Ruth se ofreció a ayudar con Trabajo de jardín')
  })

  it('picks the shape with the most real words when two could fit', async () => {
    const { tAlert } = await loadSpanish()
    expect(tAlert('Ruth joined your village')).toBe('Ruth se unió a su aldea')
    expect(tAlert('Ruth joined Garden Club')).toBe('Ruth se unió a Garden Club')
  })

  it('a short shape like "{n} new" cannot grab a whole alert', async () => {
    const { tAlert, t } = await loadSpanish()
    expect(t('{n} new', { n: 3 })).toBe('3 nuevos')
    expect(tAlert('Something brand new')).toBe('Something brand new')
  })

  it('leaves an alert it does not know in English, and nothing in, nothing out', async () => {
    const { tAlert } = await loadSpanish()
    expect(tAlert('The well is full again')).toBe('The well is full again')
    expect(tAlert('')).toBe('')
    expect(tAlert(null)).toBeNull()
  })

  it('goes back to the English alert after switching back to English', async () => {
    const { tAlert, setLangLocal } = await loadSpanish()
    expect(tAlert('Ruth wants to connect')).toBe('Ruth quiere conectarse')
    await setLangLocal('en')
    expect(tAlert('Ruth wants to connect')).toBe('Ruth wants to connect')
  })
})

describe('skins rename a few places', () => {
  it('a place name by itself becomes the name in the picked story', async () => {
    const { t, setSkinLocal } = await load()
    setSkinLocal('space')
    expect(t('My Corner')).toBe('My Bunk')
    setSkinLocal('fairy')
    expect(t('My Corner')).toBe('My Hollow')
  })

  it('inside a longer sentence the plain name follows in ( ), so people still know the place', async () => {
    const { t, setSkinLocal } = await load()
    setSkinLocal('space')
    expect(t('Tap My Village at the top.')).toBe('Tap My Station (your village) at the top.')
  })

  it("never changes a person's own words filled into a {spot}", async () => {
    const { t, setSkinLocal } = await load()
    setSkinLocal('space')
    expect(t('Hi, {name}', { name: 'My Corner' })).toBe('Hi, My Corner')
  })

  it('uses the Spanish skin names in Spanish', async () => {
    const { t, setSkinLocal } = await loadSpanish()
    setSkinLocal('space')
    expect(t('My Corner')).toBe('Mi litera')
    expect(t('Tap My Village at the top.')).toBe('Toque Mi estación (su aldea) arriba.')
  })

  it('Home Place keeps the plain names', async () => {
    const { t } = await load()
    expect(t('My Corner')).toBe('My Corner')
    expect(t('Tap My Village at the top.')).toBe('Tap My Village at the top.')
  })

  it('Simple view keeps the plain names even when a story is picked', async () => {
    const { t, setSkinLocal, applySkinClass } = await load()
    setSkinLocal('space')
    document.documentElement.classList.add('simple')
    applySkinClass()
    expect(t('My Corner')).toBe('My Corner')
  })

  it('plainName gives the "(your cottage)" hint only while a story is on, and only for a renamed place', async () => {
    const { plainName, setSkinLocal } = await load()
    expect(plainName('My Cottage')).toBe('')
    setSkinLocal('mycelium')
    expect(plainName('My Cottage')).toBe('(your cottage)')
    expect(plainName('Messages')).toBe('')
  })

  it('plainName answers in Spanish when Spanish is picked', async () => {
    const { plainName, setSkinLocal } = await loadSpanish()
    setSkinLocal('mycelium')
    expect(plainName('My Cottage')).toBe('(su casita)')
  })

  it('tabWord gives the story word for a top bar tab, or the usual word on Home Place', async () => {
    const { tabWord, setSkinLocal } = await load()
    expect(tabWord('World')).toBe('World')
    setSkinLocal('space')
    expect(tabWord('World')).toBe('Galaxy')
    expect(tabWord('Corner')).toBe('Bunk')
  })

  it('tabWord answers in Spanish when Spanish is picked', async () => {
    const { tabWord, setSkinLocal } = await loadSpanish()
    expect(tabWord('World')).toBe('Mundo')
    setSkinLocal('space')
    expect(tabWord('World')).toBe('Galaxia')
  })
})

describe('useT', () => {
  it('re-draws the screen when the language changes, and again when the rest of the words arrive', async () => {
    const { useT, setLangLocal } = await load()
    const { result } = renderHook(() => { const t = useT(); return t('Good morning') + ' / ' + t('A neighbor') })
    expect(result.current).toBe('Good morning / A neighbor')
    await act(() => setLangLocal('es'))
    await waitFor(() => expect(result.current).toBe('Buenos días / Un vecino'))
    await act(() => setLangLocal('en'))
    expect(result.current).toBe('Good morning / A neighbor')
  })

  it('re-draws the screen when the skin changes', async () => {
    const { useT, setSkinLocal } = await load()
    const { result } = renderHook(() => useT()('My Corner'))
    expect(result.current).toBe('My Corner')
    act(() => setSkinLocal('space'))
    expect(result.current).toBe('My Bunk')
  })

  it('stops listening when the screen goes away', async () => {
    const { useT, setLangLocal } = await load()
    const draws = vi.fn()
    const { unmount } = renderHook(() => { draws(); return useT() })
    unmount()
    const before = draws.mock.calls.length
    await setLangLocal('es')
    expect(draws).toHaveBeenCalledTimes(before)
  })
})

describe('the real Spanish word lists (src/data/es.js and es-more.js)', () => {
  const spots = (s) => [...new Set([...String(s).matchAll(/\{(\w+)\}/g)].map((m) => m[1]))].sort()

  it.each(['es.js', 'es-more.js'])('%s: every entry has Spanish words, with the same {spots} as its English', async (file) => {
    const words = (await vi.importActual('../../src/data/' + file)).default
    const entries = Object.entries(words)
    expect(entries.length).toBeGreaterThan(100)
    const blank = entries.filter(([, es]) => typeof es !== 'string' || !es.trim()).map(([en]) => en)
    const wrongSpots = entries.filter(([en, es]) => spots(en).join() !== spots(es).join()).map(([en]) => en)
    expect(blank).toEqual([])
    expect(wrongSpots).toEqual([])
  })

  it('the real lists load through setLangLocal and translate a first-screen phrase', async () => {
    vi.resetModules()
    const es = (await vi.importActual('../../src/data/es.js')).default
    const { setLangLocal, t } = await import('../../src/utils/lang')
    await setLangLocal('es')
    expect(es['Good morning']).toBeTruthy()
    expect(t('Good morning')).toBe(es['Good morning'])
    expect(t('Good morning')).not.toBe('Good morning')
  })
})
