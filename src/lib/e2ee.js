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
// Private keys are generated on-device and never sent anywhere in a form
// VWB could read. Only the public key is written to Supabase. A person
// can OPT IN to a recovery key (Oct 3): the app locks a backup of the
// device key with a long random code that only the person holds, and saves
// just the locked backup. Without a recovery key, losing the device or
// clearing site data loses that device's key for good.
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

// A plain-words name for this device, like "Chrome on Windows". It is shown
// only to its owner, in Settings, so you can tell your devices apart.
function describeThisDevice() {
  try {
    const ua = navigator.userAgent || ''
    const installed = (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true
    let os = 'this device'
    if (/iPhone/.test(ua)) os = 'iPhone'
    else if (/iPad/.test(ua)) os = 'iPad'
    else if (/Android/.test(ua)) os = 'Android'
    else if (/Windows/.test(ua)) os = 'Windows'
    else if (/Mac OS X|Macintosh/.test(ua)) os = 'Mac'
    else if (/CrOS/.test(ua)) os = 'Chromebook'
    else if (/Linux/.test(ua)) os = 'Linux'
    if (installed) return 'Installed app on ' + os
    let browser = 'Browser'
    if (/Edg\//.test(ua)) browser = 'Edge'
    else if (/OPR\/|Opera/.test(ua)) browser = 'Opera'
    else if (/SamsungBrowser/.test(ua)) browser = 'Samsung Internet'
    else if (/Firefox|FxiOS/.test(ua)) browser = 'Firefox'
    else if (/Chrome|CriOS/.test(ua)) browser = 'Chrome'
    else if (/Safari/.test(ua)) browser = 'Safari'
    return browser + ' on ' + os
  } catch {
    return 'Unknown device'
  }
}

// Saves this device's name and "last used" time, once per app start. A
// failure here (for example before the database file has been run) never
// affects messaging.
async function recordDeviceInfo(userId, deviceId) {
  const { error } = await supabase
    .from('user_device_info')
    .upsert(
      { user_id: userId, device_id: deviceId, label: describeThisDevice(), last_seen_at: new Date().toISOString() },
      { onConflict: 'user_id,device_id' }
    )
  if (error) console.error('[e2ee] could not save device name', error)
}

// Every device on file for this person, with its name and last-used time
// where known, for the "Your devices" list in Settings.
export async function fetchMyDevices(userId) {
  const [keys, info] = await Promise.all([
    supabase.from('user_devices').select('device_id, created_at').eq('user_id', userId).order('created_at', { ascending: false }),
    supabase.from('user_device_info').select('device_id, label, last_seen_at').eq('user_id', userId),
  ])
  if (keys.error) { console.error('[e2ee] failed to list devices', keys.error); return [] }
  const names = new Map((info.data || []).map(r => [r.device_id, r]))
  return (keys.data || []).map(r => ({
    deviceId: r.device_id,
    addedAt: r.created_at,
    label: names.get(r.device_id)?.label || null,
    lastSeen: names.get(r.device_id)?.last_seen_at || null,
  }))
}

// Stops new messages from being locked for a device. Messages already on
// that device stay readable there. If the device is still in use, it adds
// itself back the next time it opens the app.
export async function removeMyDevice(userId, deviceId) {
  const { error } = await supabase.from('user_devices').delete().eq('user_id', userId).eq('device_id', deviceId)
  if (error) { console.error('[e2ee] failed to remove device', error); return false }
  await supabase.from('user_device_info').delete().eq('user_id', userId).eq('device_id', deviceId)
  return true
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

// Only one tab at a time may make this device's key, so two tabs opening at
// once cannot each make one and leave an extra device behind.
async function withKeyLock(fn) {
  try {
    if (typeof navigator !== 'undefined' && navigator.locks && navigator.locks.request) {
      return await navigator.locks.request('vwb-device-key', fn)
    }
  } catch (e) {
    console.error('[e2ee] key lock unavailable, continuing without it', e?.message || e)
  }
  return fn()
}

// People who chose "start fresh" instead of restoring, this session.
const restoreSkipped = new Set()

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
      await recordDeviceInfo(userId, existing.deviceId)
      return existing
    }

    // No key on this device. If this person has a recovery backup, don't
    // quietly make a new key: let them choose to restore first, so the
    // messages from before can still be opened.
    if (!restoreSkipped.has(userId)) {
      const { data: backup } = await supabase.from('user_key_backups').select('user_id').eq('user_id', userId).maybeSingle()
      if (backup) return null
    }

    return await withKeyLock(async () => {
      // Another tab may have made this device's key while we waited for the lock.
      const raced = await idbGet(IDENTITY_KEY)
      if (raced) return raced
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
      await recordDeviceInfo(userId, stored.deviceId)

      return stored
    })
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

// ---------------------------------------------------------------------
// Group boards
//
// Same locks as private messages: each post is encrypted once for every
// device of every current member (including your own devices), and VWB
// only ever stores the locked copies. The post row itself has no text.
// Members who have never opened VWB have no key yet, so they can't read
// posts made before they do; they're counted in `missed`.
// ---------------------------------------------------------------------

// Returns { status: 'sent' | 'not-ready' | 'error', missed }.
export async function sendGroupPost({ groupId, senderId, memberIds, text }) {
  let sodium
  try {
    sodium = (await import('libsodium-wrappers')).default
    await sodium.ready
  } catch (e) {
    console.error('[e2ee] encryption library failed to load', e?.message || e)
    return { status: 'not-ready', missed: 0 }
  }
  const identity = await ensureDeviceKeypair(senderId)
  if (!identity) return { status: 'not-ready', missed: 0 }

  const ids = Array.from(new Set([...(memberIds || []), senderId]))
  const { data: devices, error: devErr } = await supabase
    .from('user_devices')
    .select('user_id, device_id, public_key')
    .in('user_id', ids)
  if (devErr) { console.error('[e2ee] failed to fetch member keys', devErr); return { status: 'error', missed: 0 } }

  const targets = (devices || []).map(d => ({ userId: d.user_id, deviceId: d.device_id, publicKey: d.public_key }))
  if (!targets.some(t => t.userId === senderId && t.deviceId === identity.deviceId)) {
    targets.push({ userId: senderId, deviceId: identity.deviceId, publicKey: identity.publicKey })
  }
  const withKeys = new Set(targets.map(t => t.userId))
  const missed = ids.filter(id => !withKeys.has(id)).length

  let rows
  try {
    rows = encryptCopies(sodium, identity, text, targets)
  } catch (e) {
    console.error('[e2ee] failed to encrypt group post', e)
    return { status: 'error', missed }
  }

  const { data: post, error } = await supabase
    .from('community_group_posts')
    .insert({ group_id: groupId, sender_id: senderId })
    .select('id')
    .single()
  if (error || !post) { console.error('[e2ee] failed to save group post', error); return { status: 'error', missed } }

  const { error: copyErr } = await supabase
    .from('community_group_post_copies')
    .insert(rows.map(r => ({ ...r, post_id: post.id })))
  if (copyErr) {
    console.error('[e2ee] failed to save locked copies of group post', copyErr)
    const { error: undoErr } = await supabase
      .from('community_group_posts')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', post.id)
    if (undoErr) console.error('[e2ee] failed to take down the unreadable post', undoErr)
    return { status: 'error', missed }
  }
  return { status: 'sent', missed }
}

// Opens many copies at once (a whole board), looking up each sender's
// keys only once. `copies` is [{ key, ciphertext, nonce, senderId }].
// Returns a Map of key -> text (missing if it couldn't be opened).
export async function decryptMany(copies) {
  const out = new Map()
  if (!copies || copies.length === 0) return out
  try {
    const sodium = (await import('libsodium-wrappers')).default
    await sodium.ready
    const identity = await idbGet(IDENTITY_KEY)
    if (!identity) return out
    const senders = Array.from(new Set(copies.map(c => c.senderId)))
    const { data: devices, error } = await supabase
      .from('user_devices')
      .select('user_id, public_key')
      .in('user_id', senders)
    if (error) { console.error('[e2ee] failed to fetch sender keys', error); return out }
    const keysBySender = {}
    for (const d of devices || []) (keysBySender[d.user_id] ||= []).push(d.public_key)
    const myPrivate = sodium.from_base64(identity.privateKey)
    for (const c of copies) {
      for (const pub of keysBySender[c.senderId] || []) {
        try {
          const bytes = sodium.crypto_box_open_easy(
            sodium.from_base64(c.ciphertext),
            sodium.from_base64(c.nonce),
            sodium.from_base64(pub),
            myPrivate
          )
          out.set(c.key, sodium.to_string(bytes))
          break
        } catch { /* not this device of theirs; try the next */ }
      }
    }
  } catch (e) {
    console.error('[e2ee] failed to open group posts', e)
  }
  return out
}

// ---------------------------------------------------------------------
// Editing your last message or post, and reading the edit history.
// Each edit is a NEW set of locked copies (one per device, like a new send),
// saved by a database function that checks the rules (your last message,
// within 15 minutes) and marks the message edited. Older versions stay
// readable to the people in the chat until the message is deleted.
// ---------------------------------------------------------------------
async function buildEditRows({ senderId, userIds, text }) {
  let sodium
  try {
    sodium = (await import('libsodium-wrappers')).default
    await sodium.ready
  } catch (e) {
    console.error('[e2ee] encryption library failed to load', e?.message || e)
    return { status: 'not-ready' }
  }
  const identity = await ensureDeviceKeypair(senderId)
  if (!identity) return { status: 'not-ready' }
  const ids = Array.from(new Set([...(userIds || []), senderId]))
  const { data: devices, error } = await supabase
    .from('user_devices').select('user_id, device_id, public_key').in('user_id', ids)
  if (error) { console.error('[e2ee] failed to fetch keys for edit', error); return { status: 'error' } }
  const targets = (devices || []).map(d => ({ userId: d.user_id, deviceId: d.device_id, publicKey: d.public_key }))
  if (!targets.some(t => t.userId === senderId && t.deviceId === identity.deviceId)) {
    targets.push({ userId: senderId, deviceId: identity.deviceId, publicKey: identity.publicKey })
  }
  try {
    return { status: 'ok', rows: encryptCopies(sodium, identity, text, targets) }
  } catch (e) {
    console.error('[e2ee] failed to encrypt edit', e)
    return { status: 'error' }
  }
}

// Returns 'edited', 'not-allowed' (past 15 minutes, or no longer your last
// message), 'not-ready', or 'error'.
export async function editPrivateMessage({ messageId, senderId, recipientId, text }) {
  const built = await buildEditRows({ senderId, userIds: [recipientId], text })
  if (built.status !== 'ok') return built.status
  const { error } = await supabase.rpc('edit_message', { p_message: Number(messageId), p_rows: built.rows })
  if (error) {
    console.error('[e2ee] edit failed', error)
    return error.code === '42501' ? 'not-allowed' : 'error'
  }
  return 'edited'
}

export async function editGroupPost({ postId, senderId, memberIds, text }) {
  const built = await buildEditRows({ senderId, userIds: memberIds, text })
  if (built.status !== 'ok') return built.status
  const { error } = await supabase.rpc('edit_group_post', { p_post: Number(postId), p_rows: built.rows })
  if (error) {
    console.error('[e2ee] post edit failed', error)
    return error.code === '42501' ? 'not-allowed' : 'error'
  }
  return 'edited'
}

// Every version of one message or post, oldest first, as readable text.
// kind is 'message' or 'post'. Returns [{ version, text }].
export async function fetchEditHistory({ kind, itemId, userId, senderId }) {
  const deviceId = await getDeviceId()
  if (!deviceId) return []
  const table = kind === 'post' ? 'community_group_post_copies' : 'encrypted_message_copies'
  const col = kind === 'post' ? 'post_id' : 'message_id'
  const { data, error } = await supabase
    .from(table).select('version, ciphertext, nonce')
    .eq(col, itemId).eq('user_id', userId).eq('device_id', deviceId)
    .order('version', { ascending: true })
  if (error) { console.error('[e2ee] failed to load edit history', error); return [] }
  const out = []
  for (const c of data || []) {
    const text = await decryptFromSender(c.ciphertext, c.nonce, senderId)
    out.push({ version: c.version, text: text ?? "[This version can't be opened on this device]" })
  }
  return out
}

// ---------------------------------------------------------------------
// Recovery key. The code is 128 random bits shown to the person once. A
// 256-bit key is made from it (BLAKE2b, salted) and used to lock a copy of
// this device's keypair (XSalsa20-Poly1305). Only the locked copy is saved.
// ---------------------------------------------------------------------
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

function toBase32(bytes) {
  let bits = 0, value = 0, out = ''
  for (const b of bytes) {
    value = (value << 8) | b
    bits += 8
    while (bits >= 5) { out += B32[(value >>> (bits - 5)) & 31]; bits -= 5 }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31]
  return out
}

function fromBase32(text) {
  let bits = 0, value = 0
  const out = []
  for (const ch of text) {
    const i = B32.indexOf(ch)
    if (i < 0) return null
    value = (value << 5) | i
    bits += 5
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8 }
  }
  return new Uint8Array(out)
}

function cleanCode(code) {
  return String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/0/g, 'O').replace(/1/g, 'I').replace(/8/g, 'B')
}

export function formatRecoveryCode(raw) {
  return (raw.match(/.{1,4}/g) || []).join('-')
}

function recoveryKeyFrom(sodium, codeBytes, salt) {
  return sodium.crypto_generichash(32, codeBytes, salt)
}

// Makes (or replaces) the recovery backup. Returns { code } to show once,
// or { error }.
export async function createRecoveryBackup(userId) {
  try {
    const sodium = (await import('libsodium-wrappers')).default
    await sodium.ready
    const identity = await ensureDeviceKeypair(userId)
    if (!identity) return { error: "This device doesn't have a message key yet. Close VWB, open it again, and try once more." }
    const codeBytes = sodium.randombytes_buf(16)
    const salt = sodium.randombytes_buf(32)
    const nonce = sodium.randombytes_buf(sodium.crypto_secretbox_NONCEBYTES)
    const key = recoveryKeyFrom(sodium, codeBytes, salt)
    const payload = sodium.from_string(JSON.stringify({ deviceId: identity.deviceId, publicKey: identity.publicKey, privateKey: identity.privateKey }))
    const locked = sodium.crypto_secretbox_easy(payload, nonce, key)
    const { error } = await supabase.from('user_key_backups').upsert({
      user_id: userId,
      salt: sodium.to_base64(salt),
      nonce: sodium.to_base64(nonce),
      ciphertext: sodium.to_base64(locked),
      device_id: identity.deviceId,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' })
    if (error) { console.error('[e2ee] could not save recovery backup', error); return { error: 'Could not save your recovery key. Try again.' } }
    return { code: formatRecoveryCode(toBase32(codeBytes)) }
  } catch (e) {
    console.error('[e2ee] recovery key failed', e)
    return { error: 'Could not make a recovery key. Try again.' }
  }
}

// { exists, updatedAt } for the Settings screen.
export async function getRecoveryStatus(userId) {
  const { data, error } = await supabase.from('user_key_backups').select('updated_at').eq('user_id', userId).maybeSingle()
  if (error) { console.error('[e2ee] could not check recovery key', error); return { exists: false, updatedAt: null, failed: true } }
  return { exists: !!data, updatedAt: data?.updated_at || null }
}

// True when this device has no key but the person has a recovery backup.
export async function needsKeyRestore(userId) {
  if (restoreSkipped.has(userId)) return false
  try {
    if (await idbGet(IDENTITY_KEY)) return false
  } catch (e) { return false }
  const { data } = await supabase.from('user_key_backups').select('user_id').eq('user_id', userId).maybeSingle()
  return !!data
}

// Opens the backup with the code and makes it this device's key.
// Returns 'restored', 'wrong-code', 'no-backup', or 'error'.
export async function restoreFromRecoveryCode(userId, code) {
  try {
    const sodium = (await import('libsodium-wrappers')).default
    await sodium.ready
    const codeBytes = fromBase32(cleanCode(code))
    if (!codeBytes || codeBytes.length !== 16) return 'wrong-code'
    const { data: backup, error } = await supabase.from('user_key_backups')
      .select('salt, nonce, ciphertext').eq('user_id', userId).maybeSingle()
    if (error) { console.error('[e2ee] could not read recovery backup', error); return 'error' }
    if (!backup) return 'no-backup'
    const key = recoveryKeyFrom(sodium, codeBytes, sodium.from_base64(backup.salt))
    let opened
    try {
      opened = sodium.crypto_secretbox_open_easy(sodium.from_base64(backup.ciphertext), sodium.from_base64(backup.nonce), key)
    } catch (e) {
      return 'wrong-code'
    }
    const identity = JSON.parse(sodium.to_string(opened))
    if (!identity.deviceId || !identity.publicKey || !identity.privateKey) return 'error'
    const previous = await idbGet(IDENTITY_KEY)
    await idbSet(IDENTITY_KEY, identity)
    restoreSkipped.add(userId)
    keypairSetups.delete(userId)
    // Make sure the restored key is listed, and drop the temporary one made
    // while this device was waiting.
    const { error: pubErr } = await supabase.from('user_devices').upsert(
      { user_id: userId, device_id: identity.deviceId, public_key: identity.publicKey },
      { onConflict: 'user_id,device_id' }
    )
    if (pubErr) console.error('[e2ee] could not list the restored key', pubErr)
    await recordDeviceInfo(userId, identity.deviceId)
    if (previous?.deviceId && previous.deviceId !== identity.deviceId) await removeMyDevice(userId, previous.deviceId)
    return 'restored'
  } catch (e) {
    console.error('[e2ee] restore failed', e)
    return 'error'
  }
}

// "Start fresh": make a new key now, without restoring. Old messages stay
// locked on this device. The backup stays, so restoring later still works.
export async function startFreshKey(userId) {
  restoreSkipped.add(userId)
  keypairSetups.delete(userId)
  return ensureDeviceKeypair(userId)
}

// ---------------------------------------------------------------------
// Village chats (Phase 4 test build). In a village board with the
// `scrambled` flag, a post is locked for every device of every current
// member before it leaves the phone; the database keeps only the locked
// copies and an empty message row. Timings of real use are kept on this
// phone only (key vwb_scramble_timings), so they can be read on the
// admin speed-test page.
// ---------------------------------------------------------------------
const TIMINGS_KEY = 'vwb_scramble_timings'
function recordScrambleTiming(entry) {
  try {
    const list = JSON.parse(localStorage.getItem(TIMINGS_KEY) || '[]')
    list.push({ at: new Date().toISOString(), ...entry })
    localStorage.setItem(TIMINGS_KEY, JSON.stringify(list.slice(-40)))
  } catch { /* storage may be blocked; timing is optional */ }
}
const r1 = (n) => Math.round(n * 10) / 10

// Returns { status: 'sent' | 'not-ready' | 'error', id, missed }.
// `missed` is how many members have no key yet and will not be able to read it.
export async function sendVillagePost({ boardId, senderId, text, replyTo }) {
  const t0 = performance.now()
  let sodium
  try {
    sodium = (await import('libsodium-wrappers')).default
    await sodium.ready
  } catch (e) {
    console.error('[e2ee] encryption library failed to load', e?.message || e)
    return { status: 'not-ready', id: null, missed: 0 }
  }
  const identity = await ensureDeviceKeypair(senderId)
  if (!identity) return { status: 'not-ready', id: null, missed: 0 }
  const t1 = performance.now()

  const { data: members, error: lookupErr } = await supabase.rpc('village_scramble_targets', { p_board: boardId })
  if (lookupErr || !members || members.length === 0) {
    console.error('[e2ee] failed to look up village members', lookupErr)
    return { status: 'error', id: null, missed: 0 }
  }
  const t2 = performance.now()

  const targets = members.filter(m => m.device_id).map(m => ({ userId: m.member_id, deviceId: m.device_id, publicKey: m.public_key }))
  const keyless = new Set(members.filter(m => !m.device_id).map(m => m.member_id))
  const withKeys = new Set(targets.map(t => t.userId))
  const missed = [...keyless].filter(id => !withKeys.has(id)).length
  if (!targets.some(t => t.userId === senderId && t.deviceId === identity.deviceId)) {
    targets.push({ userId: senderId, deviceId: identity.deviceId, publicKey: identity.publicKey })
  }

  let rows
  try {
    rows = encryptCopies(sodium, identity, text, targets)
  } catch (e) {
    console.error('[e2ee] failed to encrypt village post', e)
    return { status: 'error', id: null, missed }
  }
  const t3 = performance.now()

  const { data: id, error } = await supabase.rpc('send_village_scrambled', { p_board: boardId, p_reply_to: replyTo || null, p_rows: rows })
  if (error || id == null) {
    console.error('[e2ee] failed to save village post', error)
    return { status: 'error', id: null, missed }
  }
  const t4 = performance.now()

  recordScrambleTiming({
    kind: 'send',
    devices: rows.length,
    keyless: missed,
    uploadKB: r1(new Blob([JSON.stringify(rows)]).size / 1024),
    keyMs: r1(t1 - t0), lookupMs: r1(t2 - t1), lockMs: r1(t3 - t2), saveMs: r1(t4 - t3), totalMs: r1(t4 - t0),
  })
  return { status: 'sent', id, missed }
}

// Opens the village posts whose body is empty. `items` is [{ id, sender }].
// Returns a Map of id -> text; posts this device cannot open are left out.
export async function fetchVillageBodies(items) {
  const out = new Map()
  if (!items || items.length === 0) return out
  const t0 = performance.now()
  const deviceId = await getDeviceId()
  if (!deviceId) return out
  const senderOf = {}
  for (const it of items) senderOf[it.id] = it.sender
  const { data, error } = await supabase
    .from('campfire_message_copies')
    .select('message_id, version, ciphertext, nonce')
    .eq('device_id', deviceId)
    .in('message_id', items.map(i => i.id))
  if (error) { console.error('[e2ee] failed to fetch village copies', error); return out }
  const t1 = performance.now()
  // An edited message has one copy per version; open the newest.
  const newest = new Map()
  for (const c of data || []) {
    const cur = newest.get(c.message_id)
    if (!cur || c.version > cur.version) newest.set(c.message_id, c)
  }
  const opened = await decryptMany([...newest.values()].map(c => ({ key: c.message_id, ciphertext: c.ciphertext, nonce: c.nonce, senderId: senderOf[c.message_id] })))
  const t2 = performance.now()
  for (const [k, v] of opened) out.set(k, v)
  recordScrambleTiming({
    kind: 'open',
    messages: items.length, opened: out.size,
    downloadKB: r1(new Blob([JSON.stringify(data || [])]).size / 1024),
    fetchMs: r1(t1 - t0), unlockMs: r1(t2 - t1), totalMs: r1(t2 - t0),
  })
  return out
}

// Edit your last village post (within 15 minutes). The new words are locked for
// everyone who could read the original. Returns 'edited', 'not-allowed',
// 'not-ready', or 'error'.
export async function editVillagePost({ messageId, boardId, senderId, text }) {
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
  const { data: members, error: lookupErr } = await supabase.rpc('village_scramble_targets', { p_board: boardId })
  if (lookupErr || !members || members.length === 0) {
    console.error('[e2ee] failed to look up village members for edit', lookupErr)
    return 'error'
  }
  const targets = members.filter(m => m.device_id).map(m => ({ userId: m.member_id, deviceId: m.device_id, publicKey: m.public_key }))
  if (!targets.some(t => t.userId === senderId && t.deviceId === identity.deviceId)) {
    targets.push({ userId: senderId, deviceId: identity.deviceId, publicKey: identity.publicKey })
  }
  let rows
  try {
    rows = encryptCopies(sodium, identity, text, targets)
  } catch (e) {
    console.error('[e2ee] failed to encrypt village edit', e)
    return 'error'
  }
  const { error } = await supabase.rpc('edit_village_scrambled', { p_message: Number(messageId), p_rows: rows })
  if (error) {
    console.error('[e2ee] village edit failed', error)
    return error.code === '42501' ? 'not-allowed' : 'error'
  }
  return 'edited'
}

// Every version of one village post, oldest first, as readable text.
export async function fetchVillageEditHistory({ messageId, userId, senderId }) {
  const deviceId = await getDeviceId()
  if (!deviceId) return []
  const { data, error } = await supabase
    .from('campfire_message_copies').select('version, ciphertext, nonce')
    .eq('message_id', messageId).eq('user_id', userId).eq('device_id', deviceId)
    .order('version', { ascending: true })
  if (error) { console.error('[e2ee] failed to load village edit history', error); return [] }
  const out = []
  for (const c of data || []) {
    const text = await decryptFromSender(c.ciphertext, c.nonce, senderId)
    out.push({ version: c.version, text: text ?? "[This version can't be opened on this device]" })
  }
  return out
}
