// End-to-end encryption for direct messages.
//
// Built on libsodium's crypto_box (X25519 key exchange + XSalsa20-Poly1305
// authenticated encryption), the same public-key encryption family the
// Signal Protocol itself is built on. Signal's own JavaScript library is
// discontinued and isn't a realistic fit for a web app, so this is how we
// get the same real guarantee (only the people in a conversation can ever
// read a message, not the server) with a small, well-audited library.
//
// Each device gets its own keypair and publishes the public half (one row
// per device in user_devices, not per person, since Jade's call was that
// people need to use VWB from more than one device and still read the
// same conversations on each). Every private message is encrypted before
// it leaves the device; there is no plain-text fallback (Sep 27). If the
// other person has no key yet, the message waits in an outbox on the
// sender's device instead. See VWB-E2EE-Messaging-Plan-Sep21.md.
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
import { createNotification } from '../utils/notificationHelpers'

const DB_NAME = 'vwb-e2ee'
const STORE_NAME = 'keys'
const OUTBOX_STORE = 'outbox'
const IDENTITY_KEY = 'identity'

// Version 2 adds the outbox (see "Outbox" below). The upgrade only adds
// what's missing, so a device that already has its key keeps it.
// Each helper closes its connection when done, and any open connection
// closes itself if a newer version of the app needs to upgrade, so one
// old tab can't block the upgrade forever.
function openKeyStore() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 2)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME)
      if (!db.objectStoreNames.contains(OUTBOX_STORE)) db.createObjectStore(OUTBOX_STORE, { keyPath: 'id' })
    }
    req.onsuccess = () => {
      const db = req.result
      db.onversionchange = () => db.close()
      resolve(db)
    }
    req.onerror = () => reject(req.error)
  })
}

// Runs one request against one store and closes the connection after.
async function idbRun(storeName, mode, makeRequest) {
  const db = await openKeyStore()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode)
    const req = makeRequest(tx.objectStore(storeName))
    tx.oncomplete = () => { db.close(); resolve(req.result) }
    tx.onerror = () => { db.close(); reject(tx.error) }
    tx.onabort = () => { db.close(); reject(tx.error) }
  })
}

function idbGet(key) {
  return idbRun(STORE_NAME, 'readonly', store => store.get(key))
}

function idbSet(key, value) {
  return idbRun(STORE_NAME, 'readwrite', store => store.put(value, key))
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
// Overlapping first-run calls share one setup, so a device never makes
// two keys and orphans one of them.
const keypairSetups = new Map() // userId -> promise
export function ensureDeviceKeypair(userId) {
  if (!keypairSetups.has(userId)) {
    keypairSetups.set(userId, setUpDeviceKeypair(userId).then(result => {
      if (!result) keypairSetups.delete(userId) // failed: let a later call retry
      return result
    }))
  }
  return keypairSetups.get(userId)
}

async function setUpDeviceKeypair(userId) {
  try {
    const sodium = (await import('libsodium-wrappers')).default
    await sodium.ready
    const existing = await idbGet(IDENTITY_KEY)
    if (existing) {
      // Re-publish once per app start. Cheap, and it repairs a device
      // whose first publish failed, or a second person signing in on the
      // same phone, who would otherwise never get a key on file.
      const { error } = await supabase
        .from('user_devices')
        .upsert(
          { user_id: userId, device_id: existing.deviceId, public_key: existing.publicKey },
          { onConflict: 'user_id,device_id' }
        )
      if (error) console.error('[e2ee] failed to re-publish device key', error)
      return existing
    }

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

// Builds one encrypted copy of a message per device: every device the
// recipient has, plus every device of the sender's own (including this
// one), so a sent message is readable from any of your own devices too
// (the way Signal's multi-device sync works) AND from this same device
// after a reload, since chat_messages.body is always left empty -- there
// is nowhere else this device could read it back from.
function encryptCopies(sodium, identity, plaintext, targets) {
  return targets.map(target => {
    const nonce = sodium.randombytes_buf(sodium.crypto_box_NONCEBYTES)
    const ciphertext = sodium.crypto_box_easy(
      plaintext,
      nonce,
      sodium.from_base64(target.publicKey),
      sodium.from_base64(identity.privateKey)
    )
    return {
      user_id: target.userId,
      device_id: target.deviceId,
      ciphertext: sodium.to_base64(ciphertext),
      nonce: sodium.to_base64(nonce),
    }
  })
}

// One attempt to send a private message. Returns:
//   'sent'      -- stored encrypted, nothing readable reached the server
//   'not-ready' -- can't encrypt yet (the other person has never opened
//                  VWB, so they have no key, or this device has none)
//   'error'     -- a network or database problem; try again
// There is no plain-text fallback. Jade's rule: VWB never stores anyone's
// private messages in a form VWB itself could read.
async function trySend({ conversationId, senderId, recipientId, text }) {
  let sodium
  try {
    sodium = (await import('libsodium-wrappers')).default
    await sodium.ready
  } catch (e) {
    console.error('[e2ee] encryption library failed to load', e?.message || e)
    return 'not-ready'
  }

  const identity = await ensureDeviceKeypair(senderId)
  if (!identity) return 'not-ready'

  const [recipientDevices, senderDevices] = await Promise.all([
    fetchDeviceKeys(recipientId),
    fetchDeviceKeys(senderId),
  ])
  if (recipientDevices.length === 0) return 'not-ready'

  const targets = [
    ...recipientDevices.map(d => ({ userId: recipientId, deviceId: d.device_id, publicKey: d.public_key })),
    ...senderDevices.map(d => ({ userId: senderId, deviceId: d.device_id, publicKey: d.public_key })),
  ]
  // Always include this device, even if publishing its key failed, so you
  // can read back what you just sent.
  if (!senderDevices.some(d => d.device_id === identity.deviceId)) {
    targets.push({ userId: senderId, deviceId: identity.deviceId, publicKey: identity.publicKey })
  }

  let rows
  try {
    rows = encryptCopies(sodium, identity, text, targets)
  } catch (e) {
    console.error('[e2ee] failed to encrypt message', e)
    return 'error'
  }

  const { data: inserted, error } = await supabase
    .from('chat_messages')
    .insert({ conversation_id: Number(conversationId), sender_id: senderId, body: '' })
    .select()
    .single()
  if (error || !inserted) {
    console.error('[e2ee] failed to store message', error)
    return 'error'
  }

  const { error: copyErr } = await supabase
    .from('encrypted_message_copies')
    .insert(rows.map(r => ({ ...r, message_id: inserted.id })))
  if (copyErr) {
    console.error('[e2ee] failed to store encrypted copies', copyErr)
    // A blank message nobody can read is worse than no message, so take
    // it back down and let the person try again.
    const { error: undoErr } = await supabase
      .from('chat_messages')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', inserted.id)
    if (undoErr) console.error('[e2ee] failed to remove the unreadable message', undoErr)
    return 'error'
  }
  return 'sent'
}

// ---------------------------------------------------------------------
// Outbox
//
// If the other person has never opened VWB, they have no key yet, so
// there's no way to lock a message for them. Instead of sending it as
// plain text (the old behavior), the message waits in an outbox on the
// SENDER's own device -- in the same local storage as their private key,
// never on the server. The recipient gets a nudge to open VWB. Opening it
// creates their key, and the next time the sender's app checks (opening
// VWB, or every few seconds while the chat is open) the message goes out
// encrypted. The catch: it only goes out while the sender has VWB open.
// ---------------------------------------------------------------------

function newLocalId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return 'q-' + Math.random().toString(36).slice(2) + Date.now().toString(36)
}

async function queueMessage({ conversationId, senderId, recipientId, text }) {
  const item = {
    id: newLocalId(),
    conversationId: Number(conversationId),
    senderId,
    recipientId,
    text,
    createdAt: new Date().toISOString(),
  }
  await idbRun(OUTBOX_STORE, 'readwrite', store => store.put(item))
  return item
}

// Messages this person has waiting on this device, oldest first.
// Pass a conversationId to get just that chat's.
export async function getQueuedMessages(senderId, conversationId) {
  try {
    const all = await idbRun(OUTBOX_STORE, 'readonly', store => store.getAll())
    return (all || [])
      .filter(m => m.senderId === senderId && (conversationId == null || m.conversationId === Number(conversationId)))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  } catch (e) {
    console.error('[e2ee] failed to read the outbox', e)
    return []
  }
}

// Lets someone take back a message that hasn't gone out yet.
export async function cancelQueuedMessage(localId) {
  try {
    await idbRun(OUTBOX_STORE, 'readwrite', store => store.delete(localId))
    return true
  } catch (e) {
    console.error('[e2ee] failed to cancel a waiting message', e)
    return false
  }
}

// Sends a private message, or holds it in the outbox if it can't be
// encrypted yet. Returns 'sent', 'queued', or 'failed' ('failed' means
// nothing was saved anywhere; keep the text so the person can retry).
// Messages already waiting in this chat go first, so they stay in order.
export async function sendPrivateMessage({ conversationId, senderId, recipientId, text }) {
  const waiting = await getQueuedMessages(senderId, conversationId)
  const result = waiting.length > 0 ? 'not-ready' : await trySend({ conversationId, senderId, recipientId, text })
  if (result === 'sent') return 'sent'
  if (result === 'error') return 'failed'
  try {
    await queueMessage({ conversationId, senderId, recipientId, text })
  } catch (e) {
    console.error('[e2ee] failed to hold the message on this device', e)
    return 'failed'
  }
  if (waiting.length === 0) {
    createNotification({
      userId: recipientId,
      type: 'message',
      title: 'A neighbor is trying to message you',
      body: 'Open VWB so their message can reach you privately.',
      link: '/conversation/' + conversationId,
    })
  }
  // If the key showed up while we were checking, don't make them wait.
  if (waiting.length > 0) flushOutbox(senderId)
  return 'queued'
}

// Tries to send everything waiting in this device's outbox. Safe to call
// often: overlapping calls share one run, so nothing sends twice. Within
// a chat, messages go strictly in order; if one can't go yet, the ones
// after it wait too. Resolves to the number of messages sent.
let flushing = null
export function flushOutbox(senderId) {
  if (!senderId) return Promise.resolve(0)
  if (!flushing) flushing = doFlush(senderId).finally(() => { flushing = null })
  return flushing
}

async function doFlush(senderId) {
  const items = await getQueuedMessages(senderId)
  if (items.length === 0) return 0
  const stuck = new Set()
  const delivered = new Map() // conversationId -> recipientId
  let sent = 0
  for (const item of items) {
    if (stuck.has(item.conversationId)) continue
    const result = await trySend(item)
    if (result !== 'sent') { stuck.add(item.conversationId); continue }
    await cancelQueuedMessage(item.id)
    delivered.set(item.conversationId, item.recipientId)
    sent++
  }
  delivered.forEach((recipientId, conversationId) => {
    createNotification({
      userId: recipientId,
      type: 'message',
      title: 'New message',
      body: 'You have a new message.',
      link: '/conversation/' + conversationId,
    })
  })
  return sent
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
