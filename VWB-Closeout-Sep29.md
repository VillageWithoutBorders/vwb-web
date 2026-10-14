# VWB Closeout, Sep 29, 2026

Paste this into the new chat, or add it to the Project files.

## Where things stand

### Resource search (word families)
- `vwb-resource-search.patch` applied cleanly, build passed.
- Adds `src/utils/resourceSearch.js` and updates `src/pages/CommunityResources.jsx`.
- Commit and push: commands given, **not confirmed**.
- Phone test not done: "rides", "power bill", "rent", and "zzz" (empty state with "Ask for help instead").

### Alerts popout
- Live on the phone (commit `4a5aa57`), but alert text showed dark on dark.
- Fix: light colors appended to `src/index.css` for `.alerts-popout-item`, `-title`, `-time`, `-empty`. **Not confirmed pushed or tested.**
- `vwb-notification-followup.sql` (adds `follow_up` column) **not confirmed run**. Flag buttons error until it runs.
- Still to test: flag, Follow up filter, Clear all, tour step.

### Cleanup of stray handoff files
- Commands given to `git rm --cached` the patch and CSS files and add `*.patch`, `vwb-*.css`, `vwb-*.sql` to `.gitignore`. **Not confirmed run.**

### Phone formatting scare
- A plain, unstyled screen cleared on its own. Most likely the service worker cache. Home and Ask for Help looked right afterward.

### Bring your organization (in progress)
Chosen: **Option 2**, an in-app request form that feeds the existing approval list.

**`vwb-org-requests.sql`** (latest version, not yet run successfully)
- `request_organization(...)`: signed-in member creates an org as pending (`approved = false`) and becomes its first member (role admin). Alerts admins and founder with the `org_invite_accepted` type. One waiting request per person. Length limits.
- `my_pending_organization()`: returns the member's waiting org, if any.
- `review_organization_request(org_id, approve, note)`: admin or founder only. Approve sets it live and alerts members (`org_request_approved`). Turn down alerts members with an optional note plus the info@ email (`org_request_declined`), then deletes the waiting org and its member rows.
- Adds the 2 new kinds to `notifications_type_allowed` by reading the current list. First run failed because the list is stored as one bundle, `'{a,b,c}'::text[]`. Fixed to read both formats, with a safety stop. Nothing changed on the failed run.
- The current list already includes `group_invite`, `event_signup`, `event_signup_cancel`, so the sign-up alerts SQL did run.
- Check at the bottom should show **true** 5 times.

**`vwb-org-requests.patch`** (built on the Community.jsx and Admin.jsx Jade sent Sep 29, applies cleanly, both compile)
- Community: "Bring your organization" opens a form in place of the mailto. It has name (required), what you do, email, website, and one social link. It shows a "Thanks! Your request is in" or "waiting" note, and hides the button while a request waits.
- Admin > Organizations: the tab shows "N waiting." Waiting orgs sort first, with Approve and Turn down (prompt for an optional note). Approved orgs keep Unapprove.
- Needs the `.org-request-form` / `.org-request-note` CSS block added to `index.css`. It's in the chat, in Step 2 of the patch instructions.

## Next steps, in order
1. Run the new `vwb-org-requests.sql`. Expect 5 trues.
2. `git apply vwb-org-requests.patch`, add the org form CSS, then `npm run build`.
3. Commit and push Community.jsx, Admin.jsx, and index.css (plus any unpushed alert and search changes).
4. Run `vwb-notification-followup.sql`.
5. Run the cleanup commands.
6. Phone test: org request from a second account, approve, turn down with a note, alerts text, and search.
7. Optional: add icons for `org_request_approved` and `org_request_declined` in `notificationDisplay.js`. They show a bell until then.

## Parking lot (unchanged)
- Step 3: org privacy check SQL
- Steps 4 to 9: council decisions, affiliations, test orgs, Ask for Help first screen, Council "Affiliated locals," message to council contact
- Report system: Report on blocked list, and status, actions, and notes in Admin > Reports
- Recovery Support reclassification of resources
- Campfire digest for organizers
- Code splitting (1 MB+ bundle)
- Grow the `resourceSearch.js` word families based on real searches
- Watch: a member of a still-waiting org may see "Post an event" on Community. Check what the database allows.
