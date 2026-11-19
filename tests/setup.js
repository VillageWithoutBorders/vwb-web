// Runs before every unit and functional test file.
//   * Swaps the real database client for the pretend one, so no test can reach
//     the real VWB database even by mistake.
//   * Gives the pretend browser the parts jsdom leaves out (IndexedDB, matchMedia).
//   * Wipes saved data between tests so one test can't change another.
import '@testing-library/jest-dom/vitest'
import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { afterEach, beforeEach, vi } from 'vitest'
import { cleanup } from '@testing-library/react'
import { db } from './helpers/fakeSupabase.js'

vi.mock('../src/supabaseClient', async () => {
  const { supabase } = await import('./helpers/fakeSupabase.js')
  return {
    supabase,
    keepSignedIn: () => true,
    setKeepSignedIn: () => {},
    savedSignIn: () => null,
  }
})

// A few test files run without the pretend browser (they start with
// "@vitest-environment node"), so the browser-only steps are skipped there.
const inBrowser = typeof window !== 'undefined' && typeof document !== 'undefined'

if (inBrowser) {
  if (!window.matchMedia) {
    window.matchMedia = (query) => ({
      matches: false, media: query, onchange: null,
      addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent() { return false },
    })
  }
  if (!window.scrollTo || /not implemented/i.test(String(window.scrollTo))) window.scrollTo = () => {}
  if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {}
}

beforeEach(() => {
  db.reset()
  globalThis.indexedDB = new IDBFactory()
  if (!inBrowser) return
  localStorage.clear()
  sessionStorage.clear()
  document.documentElement.className = ''
  for (const k of Object.keys(document.documentElement.dataset)) delete document.documentElement.dataset[k]
})

afterEach(() => {
  if (inBrowser) cleanup()
  vi.useRealTimers()
})
