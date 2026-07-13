# App Help Reference

This is a player-facing reference for how the app works. It is loaded into Coach's system
prompt. Keep it about *mechanics a player can act on* — no internals, no SQL, no dev framing.

> House rule (CLAUDE.md §9): user-visible behavior changes must update this file in the same
> change.

## Signing up and logging in

- **Registering for a tournament** only needs your email and name. After you register, you get a
  **magic link** by email — click it within 24 hours to confirm. No password is needed to
  register.
- Clicking the magic link takes you to a signup page where you can set a password and create a
  full account. Once you have an account, you log in with email + password.
- Your identity is tied to your email address. If you use the same email everywhere, all your
  tournaments and groups show up under one profile.
- Forgot your password? Use "Forgot password" on the login page — you'll get a reset code by
  email.
- Sessions last 24 hours; after that you log in again.

## Finding and joining tournaments

- **Browse** is public — anyone can see open tournaments and their details without logging in.
- To join, open a tournament and register with your email and name before the **registration
  deadline**. After the deadline, registration closes and you can't join.
- Some tournaments require the organizer to confirm your registration. You'll get an email
  either way.
- You can't register twice for the same tournament.

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
- **Joining is invite-only.** A group owner enters your email, and you get a personal magic-link
  invite. Clicking it (and verifying your email) joins you to the group. There are no public or
  searchable groups, and invite links can't be shared — each is single-use and tied to the
  invited email.
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

## Coach (this assistant)

- Mention **@coach** in a group chat to ask about your matches, standings, deadlines, venues,
  how the app works, or general racket-sport questions.
- Coach can also **draft actions** for you: report a score ("I beat Bob 6-4, 6-3"), start a poll,
  cast your vote on an open poll, or launch a casual tournament from a poll you created. Coach
  never does these itself — it drafts a card in the chat that only you can confirm, and nothing
  happens until you tap Confirm. If your request is ambiguous (e.g. two pending matches against
  players with similar names), Coach asks which one you mean instead of guessing.
- Coach sees only what you could see yourself in the app: this group's tournaments plus
  tournaments you're registered in, and it only ever acts as you — never as anyone else.
- Everyone in the group sees Coach's replies and any cards it drafts, so ask accordingly.
- Group owners can turn Coach off (and back on) in group settings.
- Coach has hourly usage limits per player and per group; if you hit one, it says so and you
  can try again later.
- Coach can also speak up on its own, without being asked: a **deadline reminder** when a
  scheduled tournament's group-stage deadline is 2 days or 1 day away and matches are still
  unscored (it names the pending matches); a **recap** naming the winner and standings once a
  group-linked tournament finishes; and, for groups that opt in, a **weekly digest** summarizing
  results, pending matches, and the nearest upcoming deadline. These only post while Coach is
  enabled for the group. The weekly digest is off by default — turn it on in group settings.
