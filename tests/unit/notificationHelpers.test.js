// Alerts: you can only clear your own, a flagged alert is kept, and chat alerts are
// left alone because they clear when the chat is opened.
import { describe, expect, it, vi } from 'vitest'
import { db } from '../helpers/fakeSupabase.js'
import {
  clearAllNotifications, createNotification, deleteNotification, markAllNotificationsRead,
  markNotificationRead, setNotificationFollowUp,
} from '../../src/utils/notificationHelpers'

function seedAlerts() {
  db.seed('notifications', [
    { id: 1, user_id: 'me', type: 'offer_accepted', read: false, follow_up: false },
    { id: 2, user_id: 'me', type: 'vouch', read: false, follow_up: true },
    { id: 3, user_id: 'me', type: 'message', read: false, follow_up: false },
    { id: 4, user_id: 'me', type: 'group_post', read: false, follow_up: false },
    { id: 5, user_id: 'me', type: 'campfire', read: false, follow_up: false },
    { id: 6, user_id: 'me', type: 'offer_declined', read: true, follow_up: false },
    { id: 7, user_id: 'neighbor', type: 'offer_accepted', read: false, follow_up: false },
  ])
}
const ids = (rows) => rows.map((r) => r.id).sort()

describe('createNotification', () => {
  it('saves an alert for the person it is for', async () => {
    await createNotification({ userId: 'ruth', type: 'offer_accepted', title: 'Your offer was accepted!', body: 'Yard work', link: '/tasks' })
    expect(db.rows('notifications')).toEqual([
      expect.objectContaining({ user_id: 'ruth', type: 'offer_accepted', title: 'Your offer was accepted!', body: 'Yard work', link: '/tasks' }),
    ])
  })

  it('does nothing when there is nobody to tell', async () => {
    await createNotification({ userId: null, type: 'x', title: 't' })
    expect(db.calls).toHaveLength(0)
  })

  it('does not break what the person was doing when the alert cannot be saved', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    db.failNext('notifications', 'insert')
    await expect(createNotification({ userId: 'ruth', type: 'x', title: 't' })).resolves.toBeUndefined()
    expect(console.error).toHaveBeenCalled()
  })
})

describe('marking alerts read', () => {
  it('markNotificationRead marks just that one', async () => {
    seedAlerts()
    await markNotificationRead(1)
    expect(ids(db.rows('notifications').filter((n) => n.read))).toEqual([1, 6])
  })

  it("markAllNotificationsRead marks my unread alerts, but not chat alerts and not a neighbor's", async () => {
    seedAlerts()
    await markAllNotificationsRead('me')
    expect(ids(db.rows('notifications').filter((n) => n.read))).toEqual([1, 2, 6])
  })

  it('markAllNotificationsRead does nothing when nobody is signed in', async () => {
    seedAlerts()
    await markAllNotificationsRead(undefined)
    expect(db.calls).toHaveLength(0)
  })
})

describe('deleteNotification', () => {
  it('removes just that alert', async () => {
    seedAlerts()
    await deleteNotification(6)
    expect(ids(db.rows('notifications'))).toEqual([1, 2, 3, 4, 5, 7])
  })
})

describe('setNotificationFollowUp', () => {
  it('flags an alert to come back to, and un-flags it', async () => {
    seedAlerts()
    expect(await setNotificationFollowUp(1, 'yes')).toEqual({ error: null })
    expect(db.rows('notifications').find((n) => n.id === 1).follow_up).toBe(true)
    await setNotificationFollowUp(1, undefined)
    expect(db.rows('notifications').find((n) => n.id === 1).follow_up).toBe(false)
  })

  it('hands back the error so the screen can say it did not work', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    db.failNext('notifications', 'update', { message: 'column follow_up does not exist' })
    expect((await setNotificationFollowUp(1, true)).error).toEqual({ message: 'column follow_up does not exist' })
  })
})

describe('clearAllNotifications', () => {
  it("removes my alerts, read or not, but keeps flagged ones, chat alerts, and a neighbor's alerts", async () => {
    seedAlerts()
    expect(await clearAllNotifications('me')).toEqual({ error: null })
    expect(ids(db.rows('notifications'))).toEqual([2, 3, 4, 5, 7])
  })

  it('does nothing when nobody is signed in', async () => {
    seedAlerts()
    expect(await clearAllNotifications(null)).toEqual({ error: null })
    expect(db.calls).toHaveLength(0)
    expect(db.rows('notifications')).toHaveLength(7)
  })

  it('hands back the error and removes nothing when the database says no', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    seedAlerts()
    db.failNext('notifications', 'delete', { message: 'nope' })
    expect((await clearAllNotifications('me')).error).toEqual({ message: 'nope' })
    expect(db.rows('notifications')).toHaveLength(7)
  })
})
