import { useSyncExternalStore } from 'react'
import { supabase } from '../supabaseClient'

// Skins, "Choose your story" (Nov 11, Jade). A skin changes only the look and some
// place names. Never the buttons, their order, where they sit, or what they do.
// Saved on the account (helper_profiles.skin, empty = Home Place) so it follows the
// person to any phone. Also kept on this device so it shows before the profile loads
// (index.html adds the class before the page draws).
// Simple view always uses Home Place, so it never gets a skin class.
const KEY = 'vwb_skin'
export const SKINS = ['home', 'space', 'mycelium', 'fairy']
const subs = new Set()

function clean(v) { return SKINS.includes(v) ? v : 'home' }

function read() {
  try { return clean(localStorage.getItem(KEY)) } catch { return 'home' }
}

let skin = read()

function simpleOn() { return document.documentElement.classList.contains('simple') }

// The skin people see right now: Home Place while Simple view is on.
export function activeSkin() { return simpleOn() ? 'home' : skin }

// The skin the person picked, even while Simple view hides it.
export function pickedSkin() { return skin }

// Put the right class on <html>. simpleView.js calls this when Simple view changes.
export function applySkinClass() {
  const root = document.documentElement
  const on = activeSkin()
  for (const s of SKINS) if (s !== 'home') root.classList.toggle('skin-' + s, on === s)
  subs.forEach((f) => f())
}

// For lang.js: re-draw words when the skin changes. Returns a function to stop.
export function onSkinChange(f) { subs.add(f); return () => subs.delete(f) }

// Change it on this device only (used when the account value loads).
export function setSkinLocal(v) {
  skin = clean(v)
  try { if (skin === 'home') localStorage.removeItem(KEY); else localStorage.setItem(KEY, skin) } catch { /* private window */ }
  applySkinClass()
}

// Change it and save it to the account. Returns true when saved.
export async function saveSkin(v) {
  setSkinLocal(v)
  const { error } = await supabase.rpc('set_skin', { p_skin: clean(v) })
  if (error) { console.error('Failed to save skin:', error); return false }
  return true
}

// The skin people see right now (Home Place in Simple view).
export function useSkin() {
  return useSyncExternalStore(
    (f) => { subs.add(f); return () => subs.delete(f) },
    activeSkin,
    () => 'home',
  )
}

// The skin the person picked (for Settings, so the choice stays marked).
export function usePickedSkin() {
  return useSyncExternalStore(
    (f) => { subs.add(f); return () => subs.delete(f) },
    pickedSkin,
    () => 'home',
  )
}
