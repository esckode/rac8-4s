# App Help Reference

This is a player-facing reference for how the app works. It is loaded into both **Ref**'s
(group chat) and **Coach**'s (1:1) system prompts. Keep it about *mechanics a player can act
on* — no internals, no SQL, no dev framing.

> House rule (CLAUDE.md §9): user-visible behavior changes must update this file in the same
> change.

## Signing up and logging in

- **Registering for a tournament** only needs your email and name. After you register, you get a
  **magic link** by email — click it within 24 hours to confirm. No password is needed to
  register.
- Clicking the magic link signs you in as a guest and takes you straight to your tournament — no
  password needed. Creating a full account (with a password) is an optional upgrade you can do
  later; it's not required to view or play in the tournament you registered for. While signed in
  as a guest, you'll see a "Create a password to save your account" prompt on your Play page —
  it routes to the same signup page.
- If you'd rather create a full account right away, use the signup page instead — once you have
  an account, you log in with email + password.
- Your identity is tied to your email address. If you use the same email everywhere, all your
  tournaments and groups show up under one profile.
- Forgot your password? Use "Forgot password" on the login page — you'll get a reset code by
  email.
- Sessions last 24 hours; after that you log in again.

## Your profile

- Tap the **Profile** link in the header to open your personal settings.
- Profile is **account-only**. If you're signed in as a guest (magic-link session, no password
  yet), Profile shows a prompt to sign up instead of a settings form — there's no account to save
  preferences against yet. Create a password first (see Signing up and logging in above), then
  your settings live here.
- The **Account** section at the top shows your email (read-only) and lets you change your
  **display name** — the name shown in group chat and how `@mentions` reach you. Renaming takes
  effect immediately for new messages and mentions; your name on **past** messages stays as it
  was when you sent them.
- **Change password** sends a reset code to your email — the same flow as "Forgot password" on
  the login page. Use the emailed code on the reset-password page to set a new one.
- **Table density** controls how compact standings and other tables render — "Comfortable" or
  "Compact".
- **Notifications**: three toggles control whether you get pushed for @mentions, new polls, and
  deadline reminders — each defaults to on. **Quiet hours** (a start/end hour) additionally drop
  any push that would otherwise arrive during that window — nothing is queued up to send later.
  Quiet hours never hide anything from you inside the app: your unscored matches, open polls,
  and pending confirmations still show up on your badges and the up-next strip regardless.
- **Availability** is a weekly grid (morning/afternoon/evening x each day) you can set in your
  profile. It's used only to suggest times where most of a group is free — ask "when can we
  play?" in a group chat and Ref will reply with a count like "4 of 6 free Saturday evening."
  Ref never says or implies which specific person is or isn't free at a slot.
- Your **Play** and **Groups** tabs show a number badge when you have something waiting on
  you (an unscored match, an open poll, a card to confirm) — it clears once you act. In a group
  chat, the message box may suggest a one-tap action (report a score, cast a vote) based on
  what's pending for you there.
- The Groups tab also shows a separate badge for **unread messages** — the number of groups
  that have something new, not a total message count. Each group in your list shows its own
  unread count too, so you can see which one to check without opening it. This is tracked
  server-side, so it stays accurate across every device you're signed in on.
- The bottom nav is always **Groups, Play, Ratings, Alerts, More** — five tabs, in that order.
  Browse (tournament discovery) isn't one of them; when it's turned on it lives inside **More**
  instead.

## Ratings

- The **Ratings** tab shows your current skill rating per sport and format (singles/doubles), and
  your most recent doubles partners. A rating below 10 played matches is marked **provisional** —
  it's still converging and moves faster than an established one.
- This is a separate page from **Profile** — Profile is account settings and preferences, Ratings
  is your stats.
- When a group poll gets launched into a casual tournament and you're one of the "In" voters, you
  may be asked "How would you rate yourself at {sport}?" the first time you play that sport — this
  only appears once per sport. It's optional: skip it and your rating starts at the default and
  adjusts as you play. Answering just gives matchmaking a better starting point.

## Finding and joining tournaments

- **Right now, entry is by group invite only** — there's no public tournament list to browse.
  Get invited to a **group** (see **Groups** below), then join a tournament through a group poll:
  vote **In**, and you're registered automatically once it launches. This is temporary — public
  browsing may return later, and the mechanics below still apply if it does.
- To join a tournament you can already see, open it and register with your email and name before
  the **registration
  deadline**. After the deadline, registration closes and you can't join.
- Some tournaments require the organizer to confirm your registration. You'll get an email
  either way.
- You can't register twice for the same tournament.
- Already signed in? Registering is one click — no need to re-type your email or name.
- Registering for a **doubles** tournament lets you invite a partner by email. Your registration
  shows as **awaiting acceptance** until they confirm. If your partner already has an account,
  they get a notification; otherwise they get an emailed invite link. Either way, your team isn't
  final until they accept. You'll both be notified as soon as your team is formed — whether you
  picked each other or the organizer paired you at group creation.
- You can be invited by more than one person at once — whoever you accept is your team, and it
  costs you nothing to be invited and never respond. Inviting someone doesn't reserve them or a
  seat for them: if you invite a not-yet-registered player, their spot isn't held, so a real
  registration can still fill the tournament while your invite is pending. You can only have one
  outstanding invite of your own at a time per tournament, though — cancel it to invite someone
  else.
- If you accept an invite while you had your own outstanding invite to someone else, that invite
  is automatically cancelled and the person you'd invited is told it's no longer available.
- Sent an invite to the wrong address? Open the tournament and **cancel the invite** in the
  partner section, then invite someone else. A brand-new-email invite nobody accepts expires with
  its link after 24 hours, after which you're free to invite a different address.
- An invite that's still unanswered when the organizer makes groups is cleared automatically —
  you won't be teamed with someone who never confirmed. You'll re-enter the pool of solo
  registrants and be paired according to your own auto-pair choice below (and the organizer's
  setting for the tournament), the same as anyone else without a confirmed partner.
- If your partner withdraws you'll be told, and you can find a new one — withdrawing dissolves a
  confirmed doubles team, so you go back to being a solo registrant free to request a new partner
  right away. This only happens for a completed withdrawal made before the registration deadline;
  a withdrawal *request* made after the deadline needs the organizer's approval first, and your
  team stays intact until then.
- Registering solo for doubles (no partner invite)? A checkbox, checked by default, lets you say
  whether you're okay being paired with another solo registrant if nobody plays with you by choice.
  It's checked automatically for you, since this is what happens today unless you say otherwise —
  either way, you'll be told at group creation whether you were auto-paired or left unpaired.
  Unchecking it means: if you never find or accept a partner, you won't play, but you also won't
  be teamed with a stranger without your say-so. This choice is made once, when you register — you
  can't change it after, and group creation is too late to ask, since registration is already
  closed by then.

## Tournament flow (scheduled tournaments)

A standard ("scheduled") tournament moves through phases:

1. **Registration open** — players sign up until the deadline.
2. **Group stage** — players are placed into round-robin groups and play everyone in their
   group. Submit scores as you play, before the group-stage deadline.
3. **Knockout bracket** — top finishers from each group advance to an elimination bracket,
   published by the organizer.
4. **Complete** — a champion is decided.

The **Matches** tab shows your matches, opponents, and status. The **Standings** tab shows your
group's live rankings. The **Bracket** tab shows the knockout draw once published.

## Submitting scores

- Scores use **per-set game scores**, comma-separated: e.g. `6-4, 6-3` means you won the first
  set 6 games to 4 and the second 6 games to 3. Enter every set played — best-of-3, so the match
  ends once one side has won 2 sets. A set can't be a tie, and the max games per set depends on
  the sport (7 for tennis; higher for pickleball, badminton, table tennis).
- In scheduled tournaments, only the **players in the match** can submit its score, and only
  before the group-stage deadline. You can resubmit to correct a mistake while the deadline is
  open.
- In **casual sessions**, scoring is open: **any registered participant can enter or fix any
  match's score**, and the app records who entered it. Scores stay editable until the session
  ends.
- Standings update automatically a few seconds after a score goes in — no refresh needed.
- Organizers can **override any match's score** at any time. An override requires entering a
  **reason** — it's recorded in the audit log alongside the organizer and the new score, so there's
  always a record of who changed a result and why. A participant correcting their own score is not
  an override and never needs a reason.

## How standings are ranked

Rankings within a group use these tiebreakers, in order:

1. **Wins** — more match wins ranks higher.
2. **Sets won** — among players with equal wins, more sets won ranks higher.
3. **Head-to-head** — still tied? Whoever won the direct match between them ranks higher.
4. **Coin flip** — if everything is tied, the order is decided randomly.

So you can be ranked below someone with the same number of wins if they won more sets, or if
they beat you head-to-head.

## Groups

- **My Groups** (the 👥 tab) lists your groups. A group is a durable circle of players with its
  own chat — it outlives any single tournament.
- To **start your own group**, tap **New group** at the top of My Groups and give it a name.
  This button is always there, whether you have no groups yet or several already.
- **Joining is invite-only.** A group owner enters your email, and you get a personal magic-link
  invite. Clicking it (and verifying your email) joins you to the group. There are no public or
  searchable groups, and invite links can't be shared — each is single-use and tied to the
  invited email.
- **If you already have an account, the invite also shows up in-app.** Open **Alerts** (🔔) and
  you'll see a card with the group's name and an **Accept** button — no need to leave the app or
  check email. Accepting takes you straight into the group's chat. Accepting an already-used
  invite shows "This invite is no longer valid" instead of failing silently. Brand-new invitees
  (no account yet) still only get the email link.
- **A pending invite keeps the Alerts badge lit even after you've opened the tab.** Just looking
  at it doesn't count as handled — the badge means "you still owe someone a response," so it only
  clears once you actually accept (or the invite expires after 7 days).
- Groups have **owners and members**. A group can have several owners. Owners can invite people,
  remove members, delete messages, promote members to owner, and change group settings. Members
  can chat, vote in polls, and create polls.
- You can leave a group at any time. Groups work best at around 12 people or fewer — the app
  warns above that but doesn't block.
- Each group has a **default match format** (singles or doubles) that new polls and sessions
  inherit; whoever launches a session can change it before confirming.

## Group chat

- Group chat is durable — messages don't expire. Tournament chat (the Messages tab inside a
  tournament) is separate and is cleaned up a while after the tournament ends.
- You can **@mention** members by name to get their attention.
- **Polls and system updates** (e.g. "Sam joined", "Tournament started") appear inline in the
  chat feed.
- Owners can remove a message; it's replaced by a "message removed" marker.

## Availability polls

- **Any member** can create a poll: a question plus a target time (e.g. "Saturday 9am?").
- Answers are **In / Out / Maybe**, everyone can see who voted what, and you can change your
  vote any time while the poll is open.
- A poll can have an optional **auto-close time**. When it closes, the card freezes with the
  final tally and a summary message posts to the chat. Without an auto-close, it stays open
  indefinitely.
- Members get a notification when a poll is created (unless they've muted the group).

## Casual sessions

- A **casual session** is a quick tournament launched from inside a group — usually straight
  from a poll. The poll creator (or a group owner using the launch flow) turns the current
  "In" voters into the player list and launches.
- Casual sessions are **round-robin**: everyone plays everyone, no knockout bracket. Rounds
  advance automatically once all the round's matches have scores.
- There are **no deadlines** in casual mode, and the session is unlisted — only your group sees
  it.
- **Casual doubles is a social mixer**: partners are assigned randomly and rotate between rounds
  so you play with different people. With an odd number of players, sit-outs rotate fairly —
  if you're sitting out, you just skip that round.
- A session ends when a group owner ends it (or after sitting idle for a while). Partial
  results still count toward the group leaderboards.

## Group leaderboards

- Every casual match feeds the group's long-term leaderboards: an **individual** board (your
  results across all partners) and a **pair** board (how each duo performs together).
- Boards rank by wins/losses, then games won, accumulated across all the group's sessions.

## Notifications

Each group has a per-member notification level, changeable in the group's settings:

- **All** — notified about every message.
- **Mentions & polls** (default) — notified when you're @mentioned and when a poll is created.
- **Muted** — no notifications from this group.

Announcements from owners notify everyone except muted members. Live updates (new messages,
scores, standings) always appear in the app in real time regardless of notification level.

## Ref (the group chat assistant)

- Mention **@ref** in a group chat to ask about your matches, standings, deadlines, venues,
  how the app works, or general racket-sport questions.
- Ref can also **draft actions** for you: report a score ("I beat Bob 6-4, 6-3"), start a poll,
  cast your vote on an open poll, or launch a casual tournament from a poll you created. Ref
  never does these itself — it drafts a card in the chat that only you can confirm, and nothing
  happens until you tap Confirm. If your request is ambiguous (e.g. two pending matches against
  players with similar names), Ref asks which one you mean instead of guessing.
- Ref sees only what you could see yourself in the app: this group's tournaments plus
  tournaments you're registered in, and it only ever acts as you — never as anyone else.
- Everyone in the group sees Ref's replies and any cards it drafts, so ask accordingly.
- Group owners can turn Ref off (and back on) in group settings.
- Ref has hourly usage limits per player and per group; if you hit one, it says so and you
  can try again later.
- Ref does not settle score disputes — if you think a reported score is wrong, there's no
  "reject" button. Ask the reporter to re-report it with the correct score, or use the confirm
  flow to accept it as recorded.
- Ref can also speak up on its own, without being asked: a **deadline reminder** when a
  scheduled tournament's group-stage deadline is 2 days or 1 day away and matches are still
  unscored (it names the pending matches and states the deadline as a clock time); a **recap**
  naming the winner and standings once a group-linked tournament finishes; and, for groups that
  opt in, a **weekly digest** — posted Sunday morning — summarizing results, pending matches,
  the nearest upcoming deadline, and (from your second week onward) a line naming anyone whose
  rank moved since last week. These only post while Ref is enabled for the group. The weekly
  digest is off by default — turn it on in group settings.
- Times Ref states to the whole group (deadlines, the weekly digest) use the **group's
  timezone** — derived from members' own timezones, or pinned by a group owner in group
  settings. Your **own timezone** (used for your profile and anything shown just to you) follows
  your device automatically unless you set one manually in your profile.

## 1:1 Coach (your private conversation)

- Every signed-in player has a private **Coach** conversation — a pinned entry at the top of
  your conversations list, separate from any group chat. It exists even if you're not in any
  groups. Guests who haven't created a full account don't have one.
- Unlike group chat, there's no `@ref` mention needed here — **every message you send is
  answered**. That also means it counts against your usage limits (below), so it's for
  questions you actually want answered, not idle chatter.
- This is the place to ask things you wouldn't want your group to see: "how do I beat Bob?",
  "am I getting worse at closing out sets?", or anything about your own game. Coach can discuss
  an opponent's game using only their visible match results (scores, records, streaks) — never
  their personality or mental state.
- Coach won't advise on injuries or pain. If you mention a physical symptom, it'll point you to
  a physio or doctor instead of guessing. General warm-up, conditioning, and technique questions
  are still fine.
- **Coach can remember things you tell it** — a preference, a piece of equipment, a goal — if
  you ask it to (or it offers, and you confirm). Nothing is remembered without your explicit
  confirmation on a card, the same tap-to-confirm pattern as group chat actions. You can see and
  delete everything Coach remembers about you from your **Profile** page, and you can turn
  memory off entirely there too.
- **Clear conversation** (in your Profile) permanently erases your Coach chat history and starts
  fresh — this does not delete anything Coach remembers about you; manage memories separately.
- Coach has its own hourly and daily usage limits here, separate from group chat; if you're
  close to a limit it lets you know, and if you hit it, it says so and you can try again later.
- Nothing you say to 1:1 Coach is ever visible to your groups, and Ref (the group assistant)
  never sees your 1:1 conversation or memories.

## Installing the app & using it offline

- On Android/desktop Chrome, an **install prompt** appears in the address bar or menu — tap
  **Install** to add the app to your home screen or apps list, no app store needed. On iPhone/iPad,
  open the site in Safari, tap **Share**, then **Add to Home Screen**. An **Install app** button also
  appears on the **Settings** page (More → Settings) once your browser has offered to install it.
- Once installed, it opens full-screen with its own icon and name — no browser address bar.
- **At a court with bad signal**, four views still work offline if you loaded them at least once
  while you had signal: **Matches, Standings, Bracket, and Details**. Anything else (chat, Coach,
  stats, settings, joining a new tournament) needs a connection.
- When you're offline, a banner reads **"Offline — showing saved data"**, and each view shows
  **"Updated HH:MM"** for when that snapshot was last refreshed. Saved snapshots are good for
  **48 hours** — after that they're treated as stale.
- **Submitting a score while offline** shows a **"Saved offline — will send when connected"**
  badge instead of a success message. It sends automatically once you're back online — you don't
  need to resubmit. If the match turns out to already be scored (your opponent submitted first),
  you'll see a clear "not applied" message instead of it silently failing.
- Other actions (like partner requests) don't work offline at all — they fail right away with a
  normal error rather than pretending to save.
- You'll stay signed in through an offline reload at a venue, even if the app can't reach the
  server to check your session — it revalidates automatically once you're back online.
- **Signing out clears all offline data** on that device — saved snapshots and anything still
  waiting to send. You can also clear it manually any time from **Settings** (More → Settings →
  Clear cached data), without signing out.
- When an update to the app is available, you'll see an **"Update available"** toast — tap it to
  refresh and apply the update on your own schedule (it never force-reloads a page you're using).

## Getting help

- For anything about games, fixtures, or membership — "can I join", scheduling, who's playing —
  **message your group owners in the group**. The **About** page (More → About) has a link to your
  groups for exactly this.
- There's no separate technical-support contact in the app yet.
