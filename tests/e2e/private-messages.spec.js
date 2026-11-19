// Private messages in a real browser. The promise: the words never leave the phone
// in a form VWB could read. These tests watch everything the app sends and check it.
import { test, expect, settled } from './support/fixtures.js'
import { USER_ID } from './support/mockBackend.js'
import { makeNeighborPhone } from './support/neighborPhone.js'

const BOB = '33333333-3333-4333-8333-333333333333'

// The open chat. On a phone it is the whole page; on a computer it sits beside the list of chats.
const chat = (page) => page.locator('.conversation-page')
const SECRET = 'The spare key is under the blue flowerpot'

function seedChat(village) {
  village.seed('conversations', [{ id: 7, helper_id: USER_ID, requester_id: BOB, created_at: '2026-11-01T00:00:00Z' }])
  village.seed('helper_profiles_public', [{ user_id: BOB, display_name: 'Bob Baker', avatar_url: null }])
}

// Everything the app sent to the server, as one string, to search for leaks.
function everythingSent(village) {
  return JSON.stringify(village.requests.map((r) => [r.path, r.query, r.body]))
}

async function myPhoneKey(village) {
  await expect.poll(() => village.rows('user_devices').filter((d) => d.user_id === USER_ID).length).toBe(1)
  return village.rows('user_devices').find((d) => d.user_id === USER_ID)
}

async function send(page, text) {
  await chat(page).getByRole('textbox', { name: 'Write a message' }).fill(text)
  await chat(page).getByRole('button', { name: 'Send', exact: true }).click()
}

test('a sent message shows in the chat, and only locked copies reach the server', async ({ page, village, signIn }) => {
  await signIn()
  seedChat(village)
  const bob = await makeNeighborPhone(BOB)
  village.seed('user_devices', [bob.deviceRow])

  await page.goto('/conversation/7')
  await settled(page)
  const mine = await myPhoneKey(village)
  await send(page, SECRET)

  await expect(chat(page).getByText(SECRET)).toBeVisible()
  const [message] = village.rows('chat_messages')
  expect(message).toMatchObject({ conversation_id: 7, sender_id: USER_ID, body: '' })
  const copies = village.rows('encrypted_message_copies')
  expect(copies.map((c) => c.device_id).sort()).toEqual([bob.deviceId, mine.device_id].sort())
  expect(everythingSent(village)).not.toContain(SECRET)
  expect(everythingSent(village)).not.toContain('flowerpot')
  // The alert to the other person says a message came, never what it says.
  expect(JSON.stringify(village.rows('notifications'))).not.toContain('flowerpot')

  // Bob's phone, and only Bob's phone, can open Bob's copy.
  const bobCopy = copies.find((c) => c.device_id === bob.deviceId)
  expect(bob.open(bobCopy, mine.public_key)).toBe(SECRET)
  const stranger = await makeNeighborPhone('44444444-4444-4444-8444-444444444444', 'stranger-phone')
  expect(stranger.open(bobCopy, mine.public_key)).toBeNull()
})

test('the private key never leaves the phone', async ({ page, village, signIn }) => {
  await signIn()
  seedChat(village)
  await page.goto('/conversation/7')
  await settled(page)
  await myPhoneKey(village)

  const saved = await page.evaluate(() => new Promise((resolve, reject) => {
    const open = indexedDB.open('vwb-e2ee')
    open.onsuccess = () => {
      const get = open.result.transaction('keys', 'readonly').objectStore('keys').get('identity')
      get.onsuccess = () => resolve(get.result)
      get.onerror = () => reject(get.error)
    }
    open.onerror = () => reject(open.error)
  }))
  expect(saved.privateKey).toBeTruthy()
  expect(everythingSent(village)).not.toContain(saved.privateKey)
  expect(everythingSent(village)).toContain(saved.publicKey)
})

test('a message from a neighbor opens on this phone', async ({ page, village, signIn }) => {
  await signIn()
  seedChat(village)
  const bob = await makeNeighborPhone(BOB)
  village.seed('user_devices', [bob.deviceRow])
  await page.goto('/conversation/7')
  await settled(page)
  const mine = await myPhoneKey(village)

  village.seed('chat_messages', [{ id: 501, conversation_id: 7, sender_id: BOB, body: '', deleted_at: null, created_at: new Date().toISOString() }])
  village.seed('encrypted_message_copies', [{ id: 1, message_id: 501, user_id: USER_ID, device_id: mine.device_id, version: 1, ...bob.lockFor('Thank you. I can bring soup at 6.', mine.public_key) }])
  await page.reload()

  await expect(chat(page).getByText('Thank you. I can bring soup at 6.')).toBeVisible()
})

test('a message this phone has no copy of says so, instead of showing nothing or breaking', async ({ page, village, signIn }) => {
  await signIn()
  seedChat(village)
  const bob = await makeNeighborPhone(BOB)
  village.seed('user_devices', [bob.deviceRow])
  village.seed('chat_messages', [{ id: 502, conversation_id: 7, sender_id: BOB, body: '', deleted_at: null, created_at: new Date().toISOString() }])
  await page.goto('/conversation/7')

  await expect(chat(page).getByText('[Unable to decrypt this message]')).toBeVisible()
  await expect(page.getByRole('textbox', { name: 'Write a message' })).toBeEnabled()
})

test('a changed copy is refused, not shown', async ({ page, village, signIn }) => {
  await signIn()
  seedChat(village)
  const bob = await makeNeighborPhone(BOB)
  village.seed('user_devices', [bob.deviceRow])
  await page.goto('/conversation/7')
  await settled(page)
  const mine = await myPhoneKey(village)

  const locked = bob.lockFor('Meet at the library.', mine.public_key)
  const tampered = { ...locked, ciphertext: (locked.ciphertext[0] === 'A' ? 'B' : 'A') + locked.ciphertext.slice(1) }
  village.seed('chat_messages', [{ id: 503, conversation_id: 7, sender_id: BOB, body: '', deleted_at: null, created_at: new Date().toISOString() }])
  village.seed('encrypted_message_copies', [{ id: 2, message_id: 503, user_id: USER_ID, device_id: mine.device_id, version: 1, ...tampered }])
  await page.reload()

  await expect(chat(page).getByText('[Unable to decrypt this message]')).toBeVisible()
  await expect(chat(page).getByText('Meet at the library.')).toHaveCount(0)
})

test('when the other person has never opened VWB, the message waits on this phone', async ({ page, village, signIn }) => {
  await signIn()
  seedChat(village) // Bob has no phone key on file
  await page.goto('/conversation/7')
  await settled(page)
  await myPhoneKey(village)
  await send(page, SECRET)

  await expect(chat(page).getByText(SECRET)).toBeVisible()
  await expect(chat(page).getByText('Waiting to send')).toBeVisible()
  await expect(page.getByRole('status').filter({ hasText: "hasn't opened VWB" })).toContainText('Bob Baker')
  expect(village.rows('chat_messages')).toEqual([])
  expect(village.rows('encrypted_message_copies')).toEqual([])
  expect(everythingSent(village)).not.toContain(SECRET)
  expect(village.rows('notifications')).toEqual([expect.objectContaining({ user_id: BOB, type: 'message', link: '/conversation/7' })])

  // Bob opens VWB (his key appears). The waiting message goes out, locked.
  const bob = await makeNeighborPhone(BOB)
  village.seed('user_devices', [bob.deviceRow])
  await page.reload()
  await expect.poll(() => village.rows('chat_messages').length).toBe(1)
  await expect(page.getByText('Waiting to send')).toHaveCount(0)
  const mine = village.rows('user_devices').find((d) => d.user_id === USER_ID)
  const bobCopy = village.rows('encrypted_message_copies').find((c) => c.device_id === bob.deviceId)
  expect(bob.open(bobCopy, mine.public_key)).toBe(SECRET)
  expect(everythingSent(village)).not.toContain(SECRET)
})

test('a message that cannot be saved stays in the box to try again', async ({ page, village, signIn }) => {
  await signIn()
  seedChat(village)
  const bob = await makeNeighborPhone(BOB)
  village.seed('user_devices', [bob.deviceRow])
  await page.goto('/conversation/7')
  await settled(page)
  await myPhoneKey(village)
  village.fail((r) => r.table === 'chat_messages' && r.method === 'POST')
  await send(page, 'Can you still come by?')

  await expect(page.getByText('Could not send your message. Check your connection and try again.')).toBeVisible()
  await expect(page.getByRole('textbox', { name: 'Write a message' })).toHaveValue('Can you still come by?')
})

test('the Messages list opens for a signed-in neighbor', async ({ page, village, signIn }) => {
  await signIn()
  seedChat(village)
  await page.goto('/messages')
  await expect(page.getByRole('heading', { level: 1, name: 'Messages' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'New message' })).toBeVisible()
})
