// Staying safe in a private chat: block someone, or report them to the admins.
// Private messages are locked, so admins cannot read a chat. The person reporting
// chooses whether to attach the last few messages from their own phone.
import { test, expect, settled } from './support/fixtures.js'
import { USER_ID } from './support/mockBackend.js'
import { makeNeighborPhone } from './support/neighborPhone.js'

const BOB = '33333333-3333-4333-8333-333333333333'

// The open chat. On a phone it is the whole page; on a computer it sits beside the list of chats.
const chat = (page) => page.locator('.conversation-page')

async function openChat(page, village, signIn, { withMessage } = {}) {
  await signIn()
  village.seed('conversations', [{ id: 7, helper_id: USER_ID, requester_id: BOB, created_at: '2026-11-01T00:00:00Z' }])
  village.seed('helper_profiles_public', [{ user_id: BOB, display_name: 'Bob Baker', avatar_url: null }])
  const bob = await makeNeighborPhone(BOB)
  village.seed('user_devices', [bob.deviceRow])
  await page.goto('/conversation/7')
  await settled(page)
  await expect.poll(() => village.rows('user_devices').filter((d) => d.user_id === USER_ID).length).toBe(1)
  if (withMessage) {
    const mine = village.rows('user_devices').find((d) => d.user_id === USER_ID)
    village.seed('chat_messages', [{ id: 601, conversation_id: 7, sender_id: BOB, body: '', deleted_at: null, created_at: new Date().toISOString() }])
    village.seed('encrypted_message_copies', [{ id: 9, message_id: 601, user_id: USER_ID, device_id: mine.device_id, version: 1, ...bob.lockFor(withMessage, mine.public_key) }])
    await page.reload()
    await expect(chat(page).getByText(withMessage)).toBeVisible()
  }
}

async function openReport(page) {
  await chat(page).getByRole('button', { name: 'Chat settings', exact: true }).click()
  await page.getByRole('button', { name: 'Report User' }).click()
  await expect(page.getByRole('dialog').getByRole('heading', { name: 'Report Bob Baker' })).toBeVisible()
}

test('blocking asks first, then saves the block', async ({ page, village, signIn }) => {
  await openChat(page, village, signIn)
  await chat(page).getByRole('button', { name: 'Chat settings', exact: true }).click()
  await page.getByRole('button', { name: 'Block User' }).click()

  const ask = page.getByRole('alertdialog').filter({ hasText: 'Block Bob Baker?' })
  await expect(ask).toBeVisible()
  expect(village.writes('blocks')).toEqual([])
  await ask.getByRole('button', { name: 'Yes' }).click()

  await expect.poll(() => village.writes('blocks').length).toBe(1)
  expect(village.writes('blocks')[0].body).toEqual({ blocker_id: USER_ID, blocked_id: BOB })
  await expect(page.getByText('Blocked.')).toBeVisible()
})

test('choosing Cancel does not block anyone', async ({ page, village, signIn }) => {
  await openChat(page, village, signIn)
  await chat(page).getByRole('button', { name: 'Chat settings', exact: true }).click()
  await page.getByRole('button', { name: 'Block User' }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Cancel' }).click()
  await expect(page.getByRole('alertdialog')).toHaveCount(0)
  expect(village.writes('blocks')).toEqual([])
})

test('a report needs a reason before it can be sent', async ({ page, village, signIn }) => {
  await openChat(page, village, signIn)
  await openReport(page)
  await page.getByRole('dialog').getByRole('button', { name: /Send|Report|Submit/ }).last().click()

  await expect(page.getByRole('alert')).toContainText('Pick the closest reason.')
  expect(village.writes('user_reports')).toEqual([])
})

test('a report goes to the admins with the reason, and the recent messages when the reporter attaches them', async ({ page, village, signIn }) => {
  await openChat(page, village, signIn, { withMessage: 'Send me your bank card number.' })
  await openReport(page)
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('radio', { name: 'Asking for money or private information' }).check()
  await dialog.getByLabel('Anything else we should know? (optional)').fill('This is the second time.')
  await expect(dialog.getByRole('checkbox', { name: /Attach the last few messages/ })).toBeChecked()
  await dialog.getByRole('button', { name: /Send|Report|Submit/ }).last().click()

  await expect(page.getByRole('dialog').getByRole('heading', { name: 'Thank you' })).toBeVisible()
  const [report] = village.writes('user_reports')
  expect(report.body).toMatchObject({ reporter_id: USER_ID, reported_user_id: BOB, source: 'conversation', reason: 'Asking for money or private information' })
  expect(report.body.details).toContain('This is the second time.')
  expect(report.body.details).toContain('Recent messages, attached by the reporter')
  expect(report.body.details).toContain('Send me your bank card number.')
})

test('with the box unchecked, a report carries none of the chat', async ({ page, village, signIn }) => {
  await openChat(page, village, signIn, { withMessage: 'Something I do not want to share.' })
  await openReport(page)
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('radio', { name: 'Something else' }).check()
  await dialog.getByRole('checkbox', { name: /Attach the last few messages/ }).uncheck()
  await dialog.getByRole('button', { name: /Send|Report|Submit/ }).last().click()

  await expect(page.getByRole('dialog').getByRole('heading', { name: 'Thank you' })).toBeVisible()
  const [report] = village.writes('user_reports')
  expect(JSON.stringify(report.body)).not.toContain('Something I do not want to share.')
  expect(report.body.reason).toBe('Something else')
})

test('if a report cannot be sent, the person is told and can try again', async ({ page, village, signIn }) => {
  await openChat(page, village, signIn)
  village.fail((r) => r.table === 'user_reports')
  await openReport(page)
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('radio', { name: 'Threatening or unsafe behavior' }).check()
  await dialog.getByRole('button', { name: /Send|Report|Submit/ }).last().click()

  await expect(page.getByRole('alert')).toContainText('Could not send your report. Try again.')
  await expect(dialog.getByRole('radio', { name: 'Threatening or unsafe behavior' })).toBeChecked()
})
