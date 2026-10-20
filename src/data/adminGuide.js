// The VWB Admin Guide, shown at /admin-guide.
// Source of truth: the "VWB Admin Guide" doc Jade reviews
// (https://claude.ai/code/artifact/f84b2af7-1d9c-45e6-b283-1f4ddc94f5d0).
// When the doc changes, update this file to match.
//
// Block types: p (paragraph, **bold** allowed), h3, ul, ol, table { head, rows }.

export const GUIDE_UPDATED = 'October 19, 2026'

export const ADMIN_GUIDE = [
  {
    id: 'what', title: 'What a VWB admin is',
    blocks: [
      { p: 'A VWB admin looks after a village so neighbors can help each other safely. You answer reports, welcome new people, check emergencies, and step in when someone needs help or protection.' },
      { p: "You are a neighbor first. Admin tools are there to serve the village, not to run it. Organizations and villages make their own decisions. VWB admins step in only when someone breaks the app rules or is unsafe." },
      { h3: 'An admin does' },
      { ul: [
        'Answer what is waiting in the Admin inbox, urgent things first',
        'Check emergency reports and member reports in their villages',
        'Approve organizations, Hope Ambassadors and new admins, together with others',
        'Keep a calm, kind voice, even when someone is upset',
      ] },
      { h3: 'An admin does not' },
      { ul: [
        "Read private chats or messages (VWB can't open them, and you never try)",
        'Look up people out of curiosity',
        'Make big decisions alone that the app says need two admins',
        "Speak for VWB in public without the founder's okay",
      ] },
    ],
  },
  {
    id: 'promises', title: 'The five promises',
    blocks: [
      { p: 'Every admin agrees to these before they start. They are the heart of this guide.' },
      { ol: [
        "**I will only look at what I need to help someone.** Open a person's details when you are working on something about them, and not otherwise.",
        '**I will never try to read private chats or messages.** VWB is built so no admin can. If someone shares their own copy in a report, that is the only way you see it.',
        "**I will keep people's information to myself.** What you see as an admin stays with VWB admins. You don't repeat it to friends, family, or other groups.",
        '**I will ask another admin when I am not sure.** Asking is a strength, not a weakness. Big decisions are made together.',
        '**I will step down if I can no longer take part.** Life changes. Stepping down kindly keeps the village safe.',
      ] },
    ],
  },
  {
    id: 'first-30', title: 'Your first 30 days',
    blocks: [
      { p: 'Every new admin starts with 30 days of learning, with a mentor admin beside them. Nothing is wrong if you are in this time. It is how everyone starts.' },
      { h3: 'During your first 30 days' },
      { ul: [
        'You look after the village you asked for, and no others.',
        "You can't ban anyone. Ask your mentor or another admin.",
        "You can't reset someone's account or two-step login. Ask another admin.",
        "You can't decide on new admins yet.",
        'Everything else is open to you: the inbox, reports, emergencies, approvals.',
      ] },
      { h3: 'Your mentor' },
      { ul: [
        'Answers your questions and checks in with you.',
        'Is named when you are approved. You can see who it is in Admin, People.',
        'After 30 days, taps **Ready** (you get every tool) or **Not yet** (30 more days). The founder can decide at any time.',
      ] },
      { p: '**Good habits to build now:** check the inbox once a day, read the Admin log to see how others handle things, and ask before you act when something feels big.' },
    ],
  },
  {
    id: 'daily', title: 'Your daily rhythm',
    blocks: [
      { p: 'Open the shield once a day and clear what is urgent first.' },
      { ol: [
        '**Turn on two-step login.** Admin tools stay locked until you do. Go to Settings, Two-Step Login, and follow the steps with an authenticator app on your phone.',
        '**Tap the shield in the top bar.** The number shows how many things are waiting. Red means something is urgent. Gold means nothing urgent.',
        '**Start with Needs you.** It is one list shared by every admin. When one of you handles something, it leaves the list for everyone.',
        '**Do the Urgent group first.** Emergency reports to check, member reports, tasks that went wrong, and anything waiting for a second admin.',
        '**Then the Waiting group.** Applications, organizations, claims, Help page messages, and resource reports.',
        "**Glance at Latest admin alerts.** These are the same alerts that buzz admins' phones.",
      ] },
      { p: '**Alerts on your phone:** every new admin item sends a push to every admin. Admin work no longer shows in your personal Alerts. If you hid alert details on your lock screen, the push only says something is waiting.' },
      { p: '**On a phone or a computer:** the phone shows the main sections with big buttons. Villages, SkillShare, CRN Import, the grant report and test tools are in the computer view, because they need more room.' },
    ],
  },
  {
    id: 'who', title: 'Who can do what',
    blocks: [
      { p: "Most work you can do alone. Anything that changes someone's standing takes two admins or the founder. Every action goes in the Admin log, which every admin can read and no one can edit." },
      { table: {
        head: ['Action', 'Admin alone', 'Takes two admins', 'Founder'],
        rows: [
          ['Answer reports, Help page messages, emergencies', 'Yes', 'No', 'Yes'],
          ['Approve organizations and resource claims', 'Yes', 'No', 'Yes'],
          ['Make someone a Hope Ambassador', 'Yes', 'No', 'Yes'],
          ['Ban a neighbor', 'Yes (not in first 30 days)', 'No', 'Yes'],
          ['Ban a Hope Ambassador, organizer, Head or keeper', 'No', 'Yes: one asks, another agrees', 'Alone'],
          ["Reset someone's two-step login", 'Neighbors and ambassadors (not in first 30 days)', 'No', 'Anyone but the founder'],
          ['Make someone an admin', 'No', 'Yes: two different yeses', 'Alone, picks the mentor'],
          ['Remove an admin', 'No', 'Yes: one asks, another agrees', 'Alone'],
          ['Ban an admin', 'No', 'No', 'Alone'],
          ['Give admins their villages', 'No', 'No', 'Alone'],
          ['Change the founder role', 'No', 'No', 'Only in the database, on purpose'],
        ],
      } },
      { p: 'The person a decision is about can never answer it. You can always step down yourself, in Settings, with Reset to Neighbor.' },
    ],
  },
  {
    id: 'situations', title: 'Common situations',
    blocks: [
      { p: 'Each one starts from the shield, then Needs you, then Open.' },
      { h3: 'An emergency report to check' },
      { ol: [
        'Read what was reported and where.',
        'Check if it is real: local news, a neighbor you trust, or the reporter.',
        'Real: tap Verify, so neighbors and groups can respond. Not real or already over: close it.',
        'Two reports of the same thing: merge the duplicate into the first one.',
      ] },
      { h3: 'A member report about a person' },
      { ol: [
        'Read both sides if you can. Message the reporter to ask what happened.',
        'Add a private note (only admins see it).',
        'Mark it reviewed, or dismissed if nothing was wrong.',
        'Someone is unsafe: ban them. For a Hope Ambassador, organizer or keeper, tap Ask to ban, and a second admin agrees in Reports.',
      ] },
      { h3: 'A safety check-in alert during a task' },
      { ol: [
        'Treat it as urgent. Message the person who sent it right away.',
        'Someone may be in danger: tell them to call 911. VWB is not an emergency service.',
        'Write what happened in the note, then follow up the next day.',
      ] },
      { h3: 'A message from the Help page' },
      { ol: [
        'Answer kindly, by message, if they left their name.',
        'A problem with the app: flag it to follow up and tell the founder.',
        "Mark it done when it's handled.",
      ] },
      { h3: 'A resource report (a listing is wrong or unsafe)' },
      { ol: [
        'Open Resource reports from the inbox.',
        "Check the listing's own website or call them.",
        'Approve the change, or reject it with a short note. A safety report pauses the listing until someone checks.',
      ] },
      { h3: 'An organization asking to join' },
      { ol: [
        'Look at their website and social links.',
        'Message their contact if anything is unclear.',
        "Approve when they are real and fit VWB's rules.",
      ] },
      { h3: 'A Hope Ambassador or admin application' },
      { ol: [
        'Read their readiness list and why they want to help.',
        'Ask people in their village who know them.',
        'Say yes or no. A no sends them a kind note; they can ask again later.',
      ] },
    ],
  },
  {
    id: 'privacy', title: 'Privacy and your villages',
    blocks: [
      { p: "You see the people in the villages the founder gives you, and no one else's private details." },
      { h3: 'In People, you see' },
      { ul: [
        'People in your villages',
        'Every admin and the founder',
        "People who haven't joined a village yet, so no one falls through the cracks",
        'Anyone waiting on a Hope Ambassador or admin review',
      ] },
      { p: 'Names on reports and alerts still show for people outside your villages, because names are already public on profiles.' },
      { h3: 'What stays private, even from admins' },
      { ul: [
        "Private messages, Cottage Chats, and scrambled village chats. VWB can't open them.",
        'Full email addresses. Admins see them partly hidden; only the founder sees them in full.',
        'Where someone lives. Never ask for an address in public, and never share one.',
      ] },
      { p: "**Good practice:** talk about a person only with the admins who need to know. Don't take screenshots of someone's details. If you share your screen, close Admin first." },
    ],
  },
  {
    id: 'help', title: 'When to ask for help',
    blocks: [
      { p: 'When in doubt, ask before you act. You will never be in trouble for asking.' },
      { h3: 'Ask another admin or your mentor when' },
      { ul: [
        'You know the person well, or you are upset with them',
        'A report could end with a ban',
        'Two people tell very different stories',
        "You aren't sure a rule was broken",
      ] },
      { h3: 'Tell the founder when' },
      { ul: [
        'Someone may be in danger, or the police are involved',
        'A reporter, journalist, or official asks about VWB or a member',
        'Someone threatens legal action',
        'You think an admin broke a promise',
        'Something in the app looks broken or unsafe',
      ] },
      { p: '**Someone in danger right now:** tell them to call 911 first. Then tell the founder.' },
    ],
  },
  {
    id: 'stepping-down', title: 'Stepping down',
    blocks: [
      { p: 'You can step down any time, with no reason needed. Thank you for the time you gave.' },
      { ol: [
        "**Tell your mentor or the founder first**, so your village isn't left without an admin.",
        '**Help find someone new.** A Hope Ambassador in your village may be ready. Point them to Become an admin.',
        "**Hand off what's open.** Finish or pass on anything you were working on, with a note.",
        '**Step down in Settings** with Reset to Neighbor. You stay a member and keep your friends, chats and history.',
      ] },
      { p: "**If you go quiet:** after 60 days without signing in, VWB asks if you are still taking part. Signing in is enough to say yes. If you don't answer, the founder may remove admin access. It's not a punishment; it keeps the village covered and the account safe." },
      { p: '**If admins need to remove you:** it takes the founder, or two admins agreeing. Every change is in the Role changes log that all admins can see.' },
    ],
  },
  {
    id: 'words', title: 'Plain words',
    blocks: [
      { table: {
        head: ['Word', 'What it means'],
        rows: [
          ['Admin log', 'The record of what admins did. Every admin can read it; no one can edit it.'],
          ['Ask to ban / Ask to remove', 'Starts a request that a second admin must agree to.'],
          ['Founder', 'The person who started VWB. Can decide alone where others need two admins.'],
          ['Hope Ambassador', 'A trusted neighbor who helps others and checks emergencies. The step before admin.'],
          ['Keeper', 'The neighbor who looks after a village or a group.'],
          ['Mentor', 'The admin who guides a new admin through their first 30 days.'],
          ['Needs you', 'The shared list of everything waiting on an admin.'],
          ['Role changes', 'The log of who gained or lost admin access, and who agreed.'],
          ['Shield', "The admin button in the top bar. Its number shows what's waiting."],
          ['Two-step login', 'A code from an app on your phone, used with your password. Required for admin tools.'],
          ['Village', 'A group of neighbors who share zip codes and a village chat.'],
          ['Vouch', 'When a member says they know and trust you.'],
        ],
      } },
    ],
  },
]
