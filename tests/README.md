# Tests

These tests check that the app still does what it promises after a change. They
run on every push and pull request, and you can run them on your own computer.

Nothing here can reach the real Village Without Borders. Every test uses a pretend
database that lives in memory and disappears when the test ends.

## Run them

```
npm test              # unit and functional tests (a few seconds)
npm run test:e2e      # whole-app tests in a real browser (a few minutes)
npm run test:all      # both
```

The first time, the whole-app tests need a browser: `npx playwright install chromium`.

While you work: `npm run test:watch` re-runs the unit tests each time you save.
To see which lines the unit tests reach: `npm run test:coverage`, then open
`coverage/index.html`.

## What is here

| Folder | What it checks | Tool |
|---|---|---|
| `tests/unit/` | One small piece at a time: reading calendar files, the Spanish words, the offline waiting lists, private-message locks. | Vitest |
| `tests/functional/` | One part of a screen, drawn in a pretend browser. | Vitest and Testing Library |
| `tests/e2e/` | The built app in a real browser, used the way a neighbor would, on a 320px phone and on a computer screen. | Playwright |

### The whole-app tests

| File | What a neighbor does |
|---|---|
| `smoke.spec.js` | Opens every main page. The right heading shows, nothing crashes, nothing scrolls sideways. |
| `auth.spec.js` | Signs up, signs in, signs out, reads the Community Guidelines. |
| `easy-to-use.spec.js` | Changes language, text size, light or dark, motion, Simple view. |
| `ask-for-help.spec.js` | Asks for help, for themselves or someone else, with and without signal. |
| `private-messages.spec.js` | Sends and reads private messages. Checks that no readable words reach the server. |
| `safety.spec.js` | Blocks and reports someone from a chat. |
| `resources.spec.js` | Finds resources without an account. Uses Quick exit. |
| `calendar-and-events.spec.js` | Looks at the public calendar, opens an event, signs up. |
| `emergency.spec.js` | Reports an emergency, with and without signal. |
| `alerts.spec.js` | Reads their alerts. |
| `offline.spec.js` | Opens the app with no signal. Checks the install card. |
| `security-headers.spec.js` | Checks the safety headers in `public/_headers`. |

The whole-app tests are served with the same safety headers as the live site
(`tests/e2e/support/serve.mjs` reads `public/_headers`). So if a change would be
blocked by the content rules (CSP) on the live site, a test fails here first.
Every test also fails by itself if a page crashes or the app asks for a web
address that is not on its allowed list.

## Writing a test

A unit test, next to the others in `tests/unit/`:

```js
import { describe, expect, it } from 'vitest'
import { db } from '../helpers/fakeSupabase.js'
import { getBlockedUserIds } from '../../src/utils/blockedUsers'

describe('getBlockedUserIds', () => {
  it('hides people you blocked and people who blocked you', async () => {
    db.seed('blocks', [{ blocker_id: 'me', blocked_id: 'a' }, { blocker_id: 'b', blocked_id: 'me' }])
    expect([...(await getBlockedUserIds('me'))].sort()).toEqual(['a', 'b'])
  })
})
```

A whole-app test, in `tests/e2e/`:

```js
import { test, expect } from './support/fixtures.js'

test('a neighbor sees their alerts', async ({ page, village, signIn }) => {
  await signIn()
  village.seed('notifications', [{ id: 1, user_id: village.user.id, type: 'offer', title: 'Welcome', body: 'Glad you are here.', read: false, created_at: new Date().toISOString() }])
  await page.goto('/notifications')
  await expect(page.getByText('Glad you are here.')).toBeVisible()
})
```

Good habits:

- Name a test for what a neighbor can do, in plain words.
- Find things on the page the way a person or a screen reader does: by its
  label, its role, or its words (`getByRole`, `getByLabel`, `getByText`).
- Check what was saved (`village.writes('help_requests')`), not just what shows.
- When a test fails, the fix is in the app or in the test's understanding of the
  app. Please do not skip a test to make the check go green.

## The pretend database

- Unit and functional tests: `tests/helpers/fakeSupabase.js` stands in for
  `src/supabaseClient.js`. Use `db.seed`, `db.onRpc`, `db.failNext`, `db.rows`.
- Whole-app tests: `tests/e2e/support/mockBackend.js` answers every request the
  browser sends to the database address. Use `village.seed`, `village.onRpc`,
  `village.fail`, `village.rows`, `village.writes`, `village.rpcCalls`.

Both keep rows in memory and understand the everyday filters the app uses. They
do not know the real database's rules (who may read or change what). Those rules
live in the database and need their own tests there.

## Time

Unit tests run in Eastern time on every computer (set in `vitest.config.js`),
because some rules use it. The whole-app browser is set to Eastern time too.
