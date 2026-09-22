// End-to-end encryption for direct messages.
//
// Built on libsodium's crypto_box (X25519 key exchange + XSalsa20-Poly1305
// authenticated encryption), the same public-key encryption family the
// Signal Protocol itself is built on. Signal's own JavaScript library is
// discontinued and isn't a realistic fit for a web app, so this is how we
// get the same real guarantee (only the people in a conversation can ever
// read a message, not the server) with a small, well-audited library.
//
// Phase 1 (this file, plus the user_devices table): generate a keypair
// per device and publish the public half. One row per device, not per
// person, since Jade's call was that people need to use VWB from more
// than one device and still read the same conversations on each.
// Nothing encrypts a real message yet.
// See VWB-E2EE-Messaging-Plan-Sep21.md for the full plan.
//
// libsodium-wrappers is loaded with a dynamic import inside each function
// rather than a static import at the top of the file. That's deliberate:
// a static import that fails to resolve crashes every module that imports
// this one, which is the whole app, since AuthContext.jsx uses it. A
// dynamic import's failure happens at runtime, inside the try/catch below,
// so a missing dependency degrades to "encryption quietly does nothing"
// rather than "the app won't load."
//
// This must NOT carry a /* @vite-ignore */ comment. That comment tells
// Vite to leave the import specifier untouched instead of resolving and
// bundling it -- which is exactly what shipped here for a while, and it
// silently broke encryption in production: the browser received a literal
// import('libsodium-wrappers') with no import map to resolve a bare
// package name against, so it failed every single time with "Failed to
// resolve module specifier," caught by the try/catch below and logged as
// if the package just wasn't installed yet. It looked identical to the
// original "not installed" case in the console, which is what let it hide.
// Vite bundles a real, installed dependency like this one correctly on its
// own; @vite-ignore was only ever the right call while the package
// genuinely wasn't in node_modules.
//
// Private keys are generated on-device and never sent anywhere. Only the
// public key is written to Supabase. There is no backup: losing the
// device or clearing site data loses that device's key for good, which
// is the deliberate tradeoff behind "only stored locally."
import { supabase } from '../supabaseClient'

const DB_NAME = 'vwb-e2ee'
const STORE_NAME = 'keys'
const IDENTITY_KEY = 'identity'

function openKeyStore() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE_NAME)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function idbGet(key) {
  const db = await openKeyStore()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly')
    const req = tx.objectStore(STORE_NAME).get(key)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function idbSet(key, value) {
  const db = await openKeyStore()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    tx.objectStore(STORE_NAME).put(value, key)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

// Identifies this device to the server as distinct from other devices the
// same person uses, so a message can be encrypted separately for each one.
function randomDeviceId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return 'device-' + Math.random().toString(36).slice(2) + Date.now().toString(36)
}

// Loads this device's keypair from IndexedDB, generating and publishing a
// new one on first use. Safe to call every time the app starts; it's a
// no-op after the first run on a given device. Never throws: a failure
// here (including libsodium not being installed yet) should never block
// someone from logging in.
export async function ensureDeviceKeypair(userId) {
  try {
    const sodium = (await import('libsodium-wrappers')).default
    await sodium.ready
    const existing = await idbGet(IDENTITY_KEY)
    if (existing) return existing

    const keypair = sodium.crypto_box_keypair()
    const stored = {
      deviceId: randomDeviceId(),
      publicKey: sodium.to_base64(keypair.publicKey),
      privateKey: sodium.to_base64(keypair.privateKey),
    }
    await idbSet(IDENTITY_KEY, stored)

    const { error } = await supabase
      .from('user_devices')
      .upsert(
        { user_id: userId, device_id: stored.deviceId, public_key: stored.publicKey },
        { onConflict: 'user_id,device_id' }
      )
    if (error) console.error('[e2ee] failed to publish device key', error)

    return stored
  } catch (e) {
    console.error('[e2ee] device key setup skipped (expected until npm install has run):', e?.message || e)
    return null
  }
}

// Fetches every public key on file for a user, one per device they've
// used VWB on. Empty array if they have none yet (an older account, or
// this hasn't been installed yet).
export async function fetchDeviceKeys(userId) {
  const { data, error } = await supabase
    .from('user_devices')
    .select('device_id, public_key')
    .eq('user_id', userId)
  if (error) { console.error('[e2ee] failed to fetch device keys', error); return [] }
  return data || []
}

// Returns this device's own device id (the value it publishes alongside
// its public key), or null if this device hasn't set up encryption yet
// (ensureDeviceKeypair hasn't run or hasn't succeeded). Conversation.jsx
// and Messages.jsx use this to know which row in encrypted_message_copies
// belongs to this device when a message's body is empty.
export async function getDeviceId() {
  try {
    const identity = await idbGet(IDENTITY_KEY)
    return identity?.deviceId || null
  } catch (e) {
    console.error('[e2ee] failed to read this device\'s id', e)
    return null
  }
}

// Encrypts a message for every device belonging to the recipient, plus
// every device of the sender's own (including this one), so a sent
// message is readable from any of your own devices too (the way
// Signal's multi-device sync works) AND from this same device after a
// reload, since chat_messages.body is left empty once encryption
// succeeds -- there is nowhere else this device could read it back
// from. Returns an array of { userId, deviceId, ciphertext, nonce },
// one per device. Returns an empty array (never throws) if encryption
// can't happen yet, libsodium isn't installed, or nobody involved has
// published a key.
export async function encryptForConversation(plaintext, senderUserId, recipientUserId) {
  try {
    const sodium = (await import('libsodium-wrappers')).default
    await sodium.ready
    const identity = await idbGet(IDENTITY_KEY)
    if (!identity) return []

    const [recipientDevices, senderDevices] = await Promise.all([
      fetchDeviceKeys(recipientUserId),
      fetchDeviceKeys(senderUserId),
    ])

    const targets = [
      ...recipientDevices.map(d => ({ userId: recipientUserId, deviceId: d.device_id, publicKey: d.public_key })),
      ...senderDevices.map(d => ({ userId: senderUserId, deviceId: d.device_id, publicKey: d.public_key })),
    ]

    return targets.map(target => {
      const nonce = sodium.randombytes_buf(sodium.crypto_box_NONCEBYTES)
      const ciphertext = sodium.crypto_box_easy(
        plaintext,
        nonce,
        sodium.from_base64(target.publicKey),
        sodium.from_base64(identity.privateKey)
      )
      return {
        userId: target.userId,
        deviceId: target.deviceId,
        ciphertext: sodium.to_base64(ciphertext),
        nonce: sodium.to_base64(nonce),
      }
    })
  } catch (e) {
    console.error('[e2ee] failed to encrypt message', e)
    return []
  }
}

// Decrypts a message copy that was encrypted for this specific device.
// Tries each of the sender's known devices' public keys, since we don't
// necessarily know which of their devices actually sent it. Returns null
// on any failure (no local key yet, no match, tampered data) rather than
// throwing, so an unreadable message fails quietly instead of crashing
// the page.
export async function decryptFromSender(ciphertextB64, nonceB64, senderUserId) {
  try {
    const sodium = (await import('libsodium-wrappers')).default
    await sodium.ready
    const identity = await idbGet(IDENTITY_KEY)
    if (!identity) return null
    const senderDevices = await fetchDeviceKeys(senderUserId)

    for (const device of senderDevices) {
      try {
        const plaintextBytes = sodium.crypto_box_open_easy(
          sodium.from_base64(ciphertextB64),
          sodium.from_base64(nonceB64),
          sodium.from_base64(device.public_key),
          sodium.from_base64(identity.privateKey)
        )
        return sodium.to_string(plaintextBytes)
      } catch (e) {
        // Not the device that sent it, try the next one.
      }
    }
    return null
  } catch (e) {
    console.error('[e2ee] failed to decrypt message', e)
    return null
  }
}
