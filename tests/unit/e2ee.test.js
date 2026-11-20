// @vitest-environment node
// Private messages (src/lib/e2ee.js). The promise these tests protect:
// VWB never stores a private message in a form VWB itself could read.
// Each "phone" below has its own key storage, the way real phones do.
// (Runs without the pretend browser: its text tools confuse the encryption
// library. The whole-app tests cover the same code in a real browser.)
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'
import { db } from '../helpers/fakeSupabase.js'

const ALICE = 'aaaaaaaa-0000-0000-0000-000000000001'
const BOB = 'bbbbbbbb-0000-0000-0000-000000000002'
const CAROL = 'cccccccc-0000-0000-0000-000000000003'
const SECRET = 'The spare key is under the blue flowerpot'

// A phone is a private key store. Using one loads a fresh copy of the app's
// encryption code pointed at that store, like opening VWB on that phone.
function newPhone() {
  return { store: new IDBFactory() }
}
async function on(phone) {
  globalThis.indexedDB = phone.store
  vi.resetModules()
  return import('../../src/lib/e2ee')
}

// Everything the pretend server holds, as one string, to search for leaks.
function everythingOnTheServer() {
  return JSON.stringify(db.tables)
}

async function privateKeyOn(phone) {
  const e2ee = await on(phone)
  const id = await e2ee.getDeviceId()
  // Read the saved key the same way the app does.
  return new Promise((resolve, reject) => {
    const open = phone.store.open('vwb-e2ee', 2)
    open.onsuccess = () => {
      const get = open.result.transaction('keys', 'readonly').objectStore('keys').get('identity')
      get.onsuccess = () => { open.result.close(); resolve({ ...get.result, deviceId: id }) }
      get.onerror = () => reject(get.error)
    }
    open.onerror = () => reject(open.error)
  })
}

let alicePhone, bobPhone
beforeEach(() => {
  alicePhone = newPhone()
  bobPhone = newPhone()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('a phone\'s message key', () => {
  it('is made on the phone, and only the public half goes to the server', async () => {
    const e2ee = await on(alicePhone)
    const identity = await e2ee.ensureDeviceKeypair(ALICE)

    expect(identity.deviceId).toBeTruthy()
    expect(db.rows('user_devices')).toEqual([
      expect.objectContaining({ user_id: ALICE, device_id: identity.deviceId, public_key: identity.publicKey }),
    ])
    expect(everythingOnTheServer()).not.toContain(identity.privateKey)
  })

  it('stays the same every time the app opens on that phone', async () => {
    const first = await (await on(alicePhone)).ensureDeviceKeypair(ALICE)
    const again = await (await on(alicePhone)).ensureDeviceKeypair(ALICE)

    expect(again.deviceId).toBe(first.deviceId)
    expect(again.publicKey).toBe(first.publicKey)
    expect(db.rows('user_devices')).toHaveLength(1)
  })

  it('is made only once when two parts of the app ask at the same moment', async () => {
    const e2ee = await on(alicePhone)
    const [a, b] = await Promise.all([e2ee.ensureDeviceKeypair(ALICE), e2ee.ensureDeviceKeypair(ALICE)])

    expect(a.deviceId).toBe(b.deviceId)
    expect(db.rows('user_devices')).toHaveLength(1)
  })

  it('puts the key back on file if the first save to the server failed', async () => {
    db.failNext('user_devices', 'upsert')
    const first = await (await on(alicePhone)).ensureDeviceKeypair(ALICE)
    expect(db.rows('user_devices')).toHaveLength(0)

    await (await on(alicePhone)).ensureDeviceKeypair(ALICE)
    expect(db.rows('user_devices')).toEqual([expect.objectContaining({ device_id: first.deviceId })])
  })

  it('records a plain name for the phone that only its owner sees', async () => {
    await (await on(alicePhone)).ensureDeviceKeypair(ALICE)
    const [info] = db.rows('user_device_info')
    expect(info.user_id).toBe(ALICE)
    expect(typeof info.label).toBe('string')
    expect(info.label.length).toBeGreaterThan(0)
  })

  it('gives each phone of the same person its own key', async () => {
    const one = await (await on(alicePhone)).ensureDeviceKeypair(ALICE)
    const two = await (await on(newPhone())).ensureDeviceKeypair(ALICE)

    expect(two.deviceId).not.toBe(one.deviceId)
    expect(two.publicKey).not.toBe(one.publicKey)
    expect(db.rows('user_devices')).toHaveLength(2)
  })
})

describe('sending a private message', () => {
  async function bothHaveKeys() {
    await (await on(bobPhone)).ensureDeviceKeypair(BOB)
    await (await on(alicePhone)).ensureDeviceKeypair(ALICE)
  }

  it('stores no readable words on the server', async () => {
    await bothHaveKeys()
    const e2ee = await on(alicePhone)
    const result = await e2ee.sendPrivateMessage({ conversationId: 7, senderId: ALICE, recipientId: BOB, text: SECRET })

    expect(result).toBe('sent')
    const [message] = db.rows('chat_messages')
    expect(message).toMatchObject({ conversation_id: 7, sender_id: ALICE, body: '' })
    expect(everythingOnTheServer()).not.toContain(SECRET)
    expect(everythingOnTheServer()).not.toContain('flowerpot')
  })

  it('locks one copy for each phone of both people', async () => {
    await bothHaveKeys()
    const bobTablet = newPhone()
    await (await on(bobTablet)).ensureDeviceKeypair(BOB)

    await (await on(alicePhone)).sendPrivateMessage({ conversationId: 7, senderId: ALICE, recipientId: BOB, text: SECRET })

    const copies = db.rows('encrypted_message_copies')
    expect(copies.filter((c) => c.user_id === BOB)).toHaveLength(2)
    expect(copies.filter((c) => c.user_id === ALICE)).toHaveLength(1)
    expect(new Set(copies.map((c) => c.nonce)).size).toBe(3)
    expect(new Set(copies.map((c) => c.message_id))).toEqual(new Set([db.rows('chat_messages')[0].id]))
  })

  it('lets the other person read it on every one of their phones', async () => {
    await bothHaveKeys()
    const bobTablet = newPhone()
    await (await on(bobTablet)).ensureDeviceKeypair(BOB)
    await (await on(alicePhone)).sendPrivateMessage({ conversationId: 7, senderId: ALICE, recipientId: BOB, text: SECRET })

    for (const phone of [bobPhone, bobTablet]) {
      const e2ee = await on(phone)
      const deviceId = await e2ee.getDeviceId()
      const mine = db.rows('encrypted_message_copies').find((c) => c.device_id === deviceId)
      expect(await e2ee.decryptFromSender(mine.ciphertext, mine.nonce, ALICE)).toBe(SECRET)
    }
  })

  it('lets the sender read back what they sent', async () => {
    await bothHaveKeys()
    const e2ee = await on(alicePhone)
    await e2ee.sendPrivateMessage({ conversationId: 7, senderId: ALICE, recipientId: BOB, text: SECRET })

    const mine = db.rows('encrypted_message_copies').find((c) => c.user_id === ALICE)
    expect(await e2ee.decryptFromSender(mine.ciphertext, mine.nonce, ALICE)).toBe(SECRET)
  })

  it('cannot be opened by anyone else, even with a copy in hand', async () => {
    await bothHaveKeys()
    const carolPhone = newPhone()
    await (await on(carolPhone)).ensureDeviceKeypair(CAROL)
    await (await on(alicePhone)).sendPrivateMessage({ conversationId: 7, senderId: ALICE, recipientId: BOB, text: SECRET })

    const carol = await on(carolPhone)
    for (const copy of db.rows('encrypted_message_copies')) {
      expect(await carol.decryptFromSender(copy.ciphertext, copy.nonce, ALICE)).toBeNull()
    }
  })

  it('refuses a copy that was changed on the way', async () => {
    await bothHaveKeys()
    await (await on(alicePhone)).sendPrivateMessage({ conversationId: 7, senderId: ALICE, recipientId: BOB, text: SECRET })

    const bob = await on(bobPhone)
    const copy = db.rows('encrypted_message_copies').find((c) => c.user_id === BOB)
    const swapped = copy.ciphertext.slice(0, -4) + (copy.ciphertext.endsWith('AAAA') ? 'BBBB' : 'AAAA')
    expect(await bob.decryptFromSender(swapped, copy.nonce, ALICE)).toBeNull()
    // And a real copy that claims to be from someone else does not open either.
    expect(await bob.decryptFromSender(copy.ciphertext, copy.nonce, CAROL)).toBeNull()
  })

  it('keeps emoji, accents and long text intact', async () => {
    await bothHaveKeys()
    const text = 'Necesito ayuda mañana 🙏 '.repeat(200)
    await (await on(alicePhone)).sendPrivateMessage({ conversationId: 7, senderId: ALICE, recipientId: BOB, text })

    const bob = await on(bobPhone)
    const copy = db.rows('encrypted_message_copies').find((c) => c.user_id === BOB)
    expect(await bob.decryptFromSender(copy.ciphertext, copy.nonce, ALICE)).toBe(text)
  })

  it('takes the blank message back down if the locked copies could not be saved', async () => {
    await bothHaveKeys()
    db.failNext('encrypted_message_copies', 'insert')
    const result = await (await on(alicePhone)).sendPrivateMessage({ conversationId: 7, senderId: ALICE, recipientId: BOB, text: SECRET })

    expect(result).toBe('failed')
    expect(db.rows('chat_messages')[0].deleted_at).toBeTruthy()
    expect(db.rows('encrypted_message_copies')).toHaveLength(0)
    expect(everythingOnTheServer()).not.toContain(SECRET)
  })

  it('says it failed, and saves nothing, when the message row cannot be saved', async () => {
    await bothHaveKeys()
    db.failNext('chat_messages', 'insert')
    const e2ee = await on(alicePhone)
    const result = await e2ee.sendPrivateMessage({ conversationId: 7, senderId: ALICE, recipientId: BOB, text: SECRET })

    expect(result).toBe('failed')
    expect(db.rows('chat_messages')).toHaveLength(0)
    expect(await e2ee.getQueuedMessages(ALICE)).toHaveLength(0)
  })

  it('stops locking new messages for a phone that was removed', async () => {
    await bothHaveKeys()
    const bobTablet = newPhone()
    const tablet = await (await on(bobTablet)).ensureDeviceKeypair(BOB)
    expect(await (await on(bobPhone)).removeMyDevice(BOB, tablet.deviceId)).toBe(true)

    await (await on(alicePhone)).sendPrivateMessage({ conversationId: 7, senderId: ALICE, recipientId: BOB, text: SECRET })

    expect(db.rows('encrypted_message_copies').some((c) => c.device_id === tablet.deviceId)).toBe(false)
    expect(db.rows('user_device_info').some((r) => r.device_id === tablet.deviceId)).toBe(false)
  })

  // Not true today: a message does not record which phone sent it, and removing a phone
  // deletes that phone's public key, so the other person can no longer open what it sent.
  it.todo('keeps earlier messages readable after the phone that sent them is removed')

  it('lists a person\'s phones with their names for Settings', async () => {
    await bothHaveKeys()
    const tablet = await (await on(newPhone())).ensureDeviceKeypair(BOB)
    const devices = await (await on(bobPhone)).fetchMyDevices(BOB)

    expect(devices.map((d) => d.deviceId).sort()).toEqual([tablet.deviceId, (await privateKeyOn(bobPhone)).deviceId].sort())
    for (const d of devices) expect(d.label).toBeTruthy()
  })
})

describe('when the other person has never opened VWB', () => {
  it('holds the message on the sender\'s phone instead of sending readable text', async () => {
    const e2ee = await on(alicePhone)
    await e2ee.ensureDeviceKeypair(ALICE)
    const result = await e2ee.sendPrivateMessage({ conversationId: 7, senderId: ALICE, recipientId: BOB, text: SECRET })

    expect(result).toBe('queued')
    expect(db.rows('chat_messages')).toHaveLength(0)
    expect(db.rows('encrypted_message_copies')).toHaveLength(0)
    expect(everythingOnTheServer()).not.toContain(SECRET)
    expect(await e2ee.getQueuedMessages(ALICE, 7)).toEqual([expect.objectContaining({ text: SECRET, recipientId: BOB, conversationId: 7 })])
  })

  it('nudges them to open VWB, without the message words, and only once', async () => {
    const e2ee = await on(alicePhone)
    await e2ee.ensureDeviceKeypair(ALICE)
    await e2ee.sendPrivateMessage({ conversationId: 7, senderId: ALICE, recipientId: BOB, text: SECRET })
    await e2ee.sendPrivateMessage({ conversationId: 7, senderId: ALICE, recipientId: BOB, text: 'second message' })

    const nudges = db.rows('notifications')
    expect(nudges).toHaveLength(1)
    expect(nudges[0]).toMatchObject({ user_id: BOB, type: 'message', link: '/conversation/7' })
    expect(JSON.stringify(nudges)).not.toContain(SECRET)
  })

  it('sends the waiting messages, in order, once they have a key', async () => {
    const alice = await on(alicePhone)
    await alice.ensureDeviceKeypair(ALICE)
    for (const text of ['one', 'two', 'three']) {
      await alice.sendPrivateMessage({ conversationId: 7, senderId: ALICE, recipientId: BOB, text })
      await new Promise((resolve) => setTimeout(resolve, 5)) // nobody types three messages in one millisecond
    }
    expect(await alice.flushOutbox(ALICE)).toBe(0)

    await (await on(bobPhone)).ensureDeviceKeypair(BOB)
    const aliceLater = await on(alicePhone)
    expect(await aliceLater.flushOutbox(ALICE)).toBe(3)
    expect(await aliceLater.getQueuedMessages(ALICE)).toHaveLength(0)

    const bob = await on(bobPhone)
    const bobDevice = await bob.getDeviceId()
    const read = []
    for (const message of db.rows('chat_messages')) {
      const copy = db.rows('encrypted_message_copies').find((c) => c.message_id === message.id && c.device_id === bobDevice)
      read.push(await bob.decryptFromSender(copy.ciphertext, copy.nonce, ALICE))
    }
    expect(read).toEqual(['one', 'two', 'three'])
  })

  it('keeps a new message behind the ones already waiting in that chat', async () => {
    const alice = await on(alicePhone)
    await alice.ensureDeviceKeypair(ALICE)
    await alice.sendPrivateMessage({ conversationId: 7, senderId: ALICE, recipientId: BOB, text: 'first' })
    await (await on(bobPhone)).ensureDeviceKeypair(BOB)

    const aliceLater = await on(alicePhone)
    const result = await aliceLater.sendPrivateMessage({ conversationId: 7, senderId: ALICE, recipientId: BOB, text: 'second' })
    expect(result).toBe('queued')
    await aliceLater.flushOutbox(ALICE)
    await vi.waitFor(async () => expect(await aliceLater.getQueuedMessages(ALICE)).toHaveLength(0))
    expect(db.rows('chat_messages')).toHaveLength(2)
  })

  it('lets the sender take a waiting message back', async () => {
    const alice = await on(alicePhone)
    await alice.ensureDeviceKeypair(ALICE)
    await alice.sendPrivateMessage({ conversationId: 7, senderId: ALICE, recipientId: BOB, text: SECRET })
    const [waiting] = await alice.getQueuedMessages(ALICE)

    expect(await alice.cancelQueuedMessage(waiting.id)).toBe(true)
    expect(await alice.getQueuedMessages(ALICE)).toHaveLength(0)
  })

  it('shows each person only their own waiting messages on a shared phone', async () => {
    const shared = await on(alicePhone)
    await shared.ensureDeviceKeypair(ALICE)
    await shared.sendPrivateMessage({ conversationId: 7, senderId: ALICE, recipientId: BOB, text: SECRET })

    expect(await shared.getQueuedMessages(CAROL)).toEqual([])
    expect(await shared.flushOutbox(null)).toBe(0)
  })
})

describe('group posts', () => {
  it('are locked for every member with a key, and count the members who have none yet', async () => {
    await (await on(bobPhone)).ensureDeviceKeypair(BOB)
    const alice = await on(alicePhone)
    await alice.ensureDeviceKeypair(ALICE)

    const result = await alice.sendGroupPost({ groupId: 'g1', senderId: ALICE, memberIds: [ALICE, BOB, CAROL], text: SECRET })

    expect(result).toEqual({ status: 'sent', missed: 1 })
    const [post] = db.rows('community_group_posts')
    expect(post).toMatchObject({ group_id: 'g1', sender_id: ALICE })
    expect(post.body).toBeUndefined()
    expect(everythingOnTheServer()).not.toContain(SECRET)
    expect(db.rows('community_group_post_copies').map((c) => c.user_id).sort()).toEqual([ALICE, BOB].sort())
  })

  it('open for members and stay shut for everyone else', async () => {
    await (await on(bobPhone)).ensureDeviceKeypair(BOB)
    const carolPhone = newPhone()
    await (await on(carolPhone)).ensureDeviceKeypair(CAROL)
    const alice = await on(alicePhone)
    await alice.ensureDeviceKeypair(ALICE)
    await alice.sendGroupPost({ groupId: 'g1', senderId: ALICE, memberIds: [ALICE, BOB], text: SECRET })

    const bob = await on(bobPhone)
    const bobCopy = db.rows('community_group_post_copies').find((c) => c.user_id === BOB)
    const opened = await bob.decryptMany([{ key: 'p', ciphertext: bobCopy.ciphertext, nonce: bobCopy.nonce, senderId: ALICE }])
    expect(opened.get('p')).toBe(SECRET)

    const carol = await on(carolPhone)
    const tried = await carol.decryptMany([{ key: 'p', ciphertext: bobCopy.ciphertext, nonce: bobCopy.nonce, senderId: ALICE }])
    expect(tried.has('p')).toBe(false)
  })

  it('take a post back down if its locked copies could not be saved', async () => {
    await (await on(bobPhone)).ensureDeviceKeypair(BOB)
    const alice = await on(alicePhone)
    await alice.ensureDeviceKeypair(ALICE)
    db.failNext('community_group_post_copies', 'insert')

    const result = await alice.sendGroupPost({ groupId: 'g1', senderId: ALICE, memberIds: [ALICE, BOB], text: SECRET })
    expect(result.status).toBe('error')
    expect(db.rows('community_group_posts')[0].deleted_at).toBeTruthy()
  })

  it('open an empty list without asking the server for anything', async () => {
    const alice = await on(alicePhone)
    await alice.ensureDeviceKeypair(ALICE)
    db.calls.length = 0
    expect((await alice.decryptMany([])).size).toBe(0)
    expect(db.calls).toHaveLength(0)
  })
})

describe('scrambled village chats', () => {
  it('send only locked copies through the database function', async () => {
    const bobKey = await (await on(bobPhone)).ensureDeviceKeypair(BOB)
    const alice = await on(alicePhone)
    const aliceKey = await alice.ensureDeviceKeypair(ALICE)
    db.onRpc('village_scramble_targets', () => [
      { member_id: ALICE, device_id: aliceKey.deviceId, public_key: aliceKey.publicKey },
      { member_id: BOB, device_id: bobKey.deviceId, public_key: bobKey.publicKey },
      { member_id: CAROL, device_id: null, public_key: null },
    ])
    db.onRpc('send_village_scrambled', () => 501)

    const result = await alice.sendVillagePost({ boardId: 'b1', senderId: ALICE, text: SECRET, replyTo: null })

    expect(result).toEqual({ status: 'sent', id: 501, missed: 1 })
    const [call] = db.rpcCalls('send_village_scrambled')
    expect(call.args.p_board).toBe('b1')
    expect(call.args.p_rows).toHaveLength(2)
    expect(JSON.stringify(call.args)).not.toContain(SECRET)

    const bob = await on(bobPhone)
    const bobRow = call.args.p_rows.find((r) => r.user_id === BOB)
    expect(await bob.decryptFromSender(bobRow.ciphertext, bobRow.nonce, ALICE)).toBe(SECRET)
  })

  it('report an error when the member list cannot be loaded', async () => {
    const alice = await on(alicePhone)
    await alice.ensureDeviceKeypair(ALICE)
    db.failNext('village_scramble_targets', 'rpc')

    expect(await alice.sendVillagePost({ boardId: 'b1', senderId: ALICE, text: SECRET })).toEqual({ status: 'error', id: null, missed: 0 })
    expect(db.rpcCalls('send_village_scrambled')).toHaveLength(0)
  })
})

describe('editing a message', () => {
  it('sends new locked copies, never the new words', async () => {
    await (await on(bobPhone)).ensureDeviceKeypair(BOB)
    const alice = await on(alicePhone)
    await alice.ensureDeviceKeypair(ALICE)

    expect(await alice.editPrivateMessage({ messageId: '12', senderId: ALICE, recipientId: BOB, text: SECRET })).toBe('edited')
    const [call] = db.rpcCalls('edit_message')
    expect(call.args.p_message).toBe(12)
    expect(call.args.p_rows).toHaveLength(2)
    expect(JSON.stringify(call.args)).not.toContain(SECRET)
  })

  it('says "not allowed" when the database refuses (too late, or not the last message)', async () => {
    await (await on(bobPhone)).ensureDeviceKeypair(BOB)
    const alice = await on(alicePhone)
    await alice.ensureDeviceKeypair(ALICE)
    db.failNext('edit_message', 'rpc', { code: '42501', message: 'not allowed' })
    expect(await alice.editPrivateMessage({ messageId: 12, senderId: ALICE, recipientId: BOB, text: 'x' })).toBe('not-allowed')

    db.failNext('edit_group_post', 'rpc', { code: 'XX000', message: 'boom' })
    expect(await alice.editGroupPost({ postId: 3, senderId: ALICE, memberIds: [BOB], text: 'x' })).toBe('error')
  })

  it('shows every version, oldest first, to someone who can read the chat', async () => {
    await (await on(bobPhone)).ensureDeviceKeypair(BOB)
    const alice = await on(alicePhone)
    await alice.ensureDeviceKeypair(ALICE)
    // The database function saves each edit as a new version of the copies.
    let version = 1
    db.onRpc('edit_message', ({ p_message, p_rows }) => {
      version += 1
      db.seed('encrypted_message_copies', p_rows.map((r) => ({ ...r, message_id: p_message, version })))
    })
    await alice.sendPrivateMessage({ conversationId: 7, senderId: ALICE, recipientId: BOB, text: 'first words' })
    const messageId = db.rows('chat_messages')[0].id
    for (const copy of db.rows('encrypted_message_copies')) copy.version = 1
    await alice.editPrivateMessage({ messageId, senderId: ALICE, recipientId: BOB, text: 'second words' })

    const bob = await on(bobPhone)
    const history = await bob.fetchEditHistory({ kind: 'message', itemId: messageId, userId: BOB, senderId: ALICE })
    expect(history).toEqual([{ version: 1, text: 'first words' }, { version: 2, text: 'second words' }])
  })
})

describe('the recovery key', () => {
  it('is a 26-letter code in groups of four, shown once', async () => {
    const alice = await on(alicePhone)
    await alice.ensureDeviceKeypair(ALICE)
    const { code, error } = await alice.createRecoveryBackup(ALICE)

    expect(error).toBeUndefined()
    expect(code).toMatch(/^([A-Z2-7]{4}-){6}[A-Z2-7]{2}$/)
    expect(alice.formatRecoveryCode('ABCDEFGHIJ')).toBe('ABCD-EFGH-IJ')
  })

  it('saves only a locked backup: no code and no private key reach the server', async () => {
    const alice = await on(alicePhone)
    const identity = await alice.ensureDeviceKeypair(ALICE)
    const { code } = await alice.createRecoveryBackup(ALICE)

    const [backup] = db.rows('user_key_backups')
    expect(backup).toMatchObject({ user_id: ALICE, device_id: identity.deviceId })
    const server = everythingOnTheServer()
    expect(server).not.toContain(identity.privateKey)
    expect(server).not.toContain(code)
    expect(server).not.toContain(code.replace(/-/g, ''))
    expect(await alice.getRecoveryStatus(ALICE)).toMatchObject({ exists: true })
  })

  it('brings old messages back on a new phone', async () => {
    await (await on(bobPhone)).ensureDeviceKeypair(BOB)
    const alice = await on(alicePhone)
    const original = await alice.ensureDeviceKeypair(ALICE)
    const { code } = await alice.createRecoveryBackup(ALICE)
    await (await on(bobPhone)).sendPrivateMessage({ conversationId: 7, senderId: BOB, recipientId: ALICE, text: SECRET })

    const newPhoneForAlice = newPhone()
    const fresh = await on(newPhoneForAlice)
    expect(await fresh.needsKeyRestore(ALICE)).toBe(true)
    expect(await fresh.restoreFromRecoveryCode(ALICE, code)).toBe('restored')
    expect(await fresh.getDeviceId()).toBe(original.deviceId)
    expect(await fresh.needsKeyRestore(ALICE)).toBe(false)

    const copy = db.rows('encrypted_message_copies').find((c) => c.user_id === ALICE)
    expect(await fresh.decryptFromSender(copy.ciphertext, copy.nonce, BOB)).toBe(SECRET)
  })

  it('does not quietly make a new key on a new phone when a backup exists', async () => {
    const alice = await on(alicePhone)
    await alice.ensureDeviceKeypair(ALICE)
    await alice.createRecoveryBackup(ALICE)

    const fresh = await on(newPhone())
    expect(await fresh.ensureDeviceKeypair(ALICE)).toBeNull()
    expect(db.rows('user_devices')).toHaveLength(1)
  })

  it('forgives how the code is typed: lower case, spaces, and 0 1 8 for O I B', async () => {
    const alice = await on(alicePhone)
    await alice.ensureDeviceKeypair(ALICE)
    const { code } = await alice.createRecoveryBackup(ALICE)
    const sloppy = code.toLowerCase().replace(/-/g, ' ').replace(/o/g, '0').replace(/i/g, '1').replace(/b/g, '8')

    expect(await (await on(newPhone())).restoreFromRecoveryCode(ALICE, sloppy)).toBe('restored')
  })

  it('turns away a wrong or badly shaped code and leaves the phone without a key', async () => {
    const alice = await on(alicePhone)
    await alice.ensureDeviceKeypair(ALICE)
    const { code } = await alice.createRecoveryBackup(ALICE)
    const wrong = (code[0] === 'A' ? 'B' : 'A') + code.slice(1)

    const fresh = await on(newPhone())
    expect(await fresh.restoreFromRecoveryCode(ALICE, wrong)).toBe('wrong-code')
    expect(await fresh.restoreFromRecoveryCode(ALICE, 'ABCD')).toBe('wrong-code')
    expect(await fresh.restoreFromRecoveryCode(ALICE, '')).toBe('wrong-code')
    expect(await fresh.getDeviceId()).toBeNull()
  })

  it('says so when there is no backup to restore', async () => {
    const fresh = await on(newPhone())
    expect(await fresh.restoreFromRecoveryCode(ALICE, 'ABCD-EFGH-IJKL-MNOP-QRST-UVWX-YZ')).toBe('no-backup')
    expect(await fresh.needsKeyRestore(ALICE)).toBe(false)
    expect(await fresh.getRecoveryStatus(ALICE)).toMatchObject({ exists: false })
  })

  it('lets someone start fresh instead, and keeps the backup for later', async () => {
    const alice = await on(alicePhone)
    const original = await alice.ensureDeviceKeypair(ALICE)
    await alice.createRecoveryBackup(ALICE)

    const fresh = await on(newPhone())
    const made = await fresh.startFreshKey(ALICE)
    expect(made.deviceId).not.toBe(original.deviceId)
    expect(await fresh.needsKeyRestore(ALICE)).toBe(false)
    expect(db.rows('user_key_backups')).toHaveLength(1)
  })

  it('replaces the temporary key when a phone that started fresh restores later', async () => {
    const alice = await on(alicePhone)
    const original = await alice.ensureDeviceKeypair(ALICE)
    const { code } = await alice.createRecoveryBackup(ALICE)

    const fresh = await on(newPhone())
    const temporary = await fresh.startFreshKey(ALICE)
    expect(await fresh.restoreFromRecoveryCode(ALICE, code)).toBe('restored')

    const onFile = db.rows('user_devices').map((d) => d.device_id)
    expect(onFile).toContain(original.deviceId)
    expect(onFile).not.toContain(temporary.deviceId)
  })

  it('makes a different code each time, and the old code stops working', async () => {
    const alice = await on(alicePhone)
    await alice.ensureDeviceKeypair(ALICE)
    const first = await alice.createRecoveryBackup(ALICE)
    const second = await alice.createRecoveryBackup(ALICE)

    expect(second.code).not.toBe(first.code)
    expect(db.rows('user_key_backups')).toHaveLength(1)
    const fresh = await on(newPhone())
    expect(await fresh.restoreFromRecoveryCode(ALICE, first.code)).toBe('wrong-code')
    expect(await fresh.restoreFromRecoveryCode(ALICE, second.code)).toBe('restored')
  })
})
