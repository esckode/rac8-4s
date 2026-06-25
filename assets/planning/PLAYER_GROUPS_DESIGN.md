# Player Groups & Availability — Design
## Durable groups, group chat, availability polls, group-launched tournaments

> 🗂️ Tracked in the [project backlog](../../BACKLOG.md).

**Date:** 2026-06-24 (open items + casual edges + compliance grilled to resolution; see §11–§12)
**Status:** 📋 DESIGN (fully grilled) — not started. A **new product track** (community layer), distinct from
but sharing infrastructure with the tournament-scoped messaging in
[`MESSAGING_DESIGN.md`](./MESSAGING_DESIGN.md).

---

## 1. Product framing & the decision

A deliberate expansion: the app becomes **not only a tournament manager but a community layer** for
**durable groups of regulars** (4–12 players who meet to play). This **intentionally reverses the
"functional, not social" stance** of the messaging design — justified because a group's social layer
*spawns play*: the group is where you **organize**, and that organizing **launches tournaments** (the
functional tie that keeps this inside a tournament app rather than a generic chat app).

Why in-app (not "use WhatsApp"): the WhatsApp Business API **cannot post into users' own group chats**
(1:1 only; automation violates ToS), so the **availability poll + group chat live in the app**; we only
*optionally* distribute share links outward.

---

## 2. The Group entity & membership — **G-1**
- **`groups`** (`id`, `name`, `owner_player_id`, `created_at`) — durable, first-class.
- **`group_members`** (`group_id`, `player_id`, `role` ∈ {owner, member}, `joined_at`) —
  **many-to-many** (a player can be in multiple groups). **Flat roles** (owner + member).
- **Join:** **invite link** (mirrors the magic-link/email identity). **Soft max 12**, no hard floor.

## 3. Conversation abstraction & storage
- **`conversations`** (`id`, `type` ∈ {tournament, group}, `tournament_id?`, `group_id?`) — the
  generalized container. **`messages.tournament_id` → `messages.conversation_id`** (a **V1 refactor**;
  each existing tournament gets a conversation row). Bus/SSE key on **`conversation_id`**.
- **Storage — Option X (separate by profile):** tournament messages stay in the **partitioned,
  completion-purged** tables (§15 — high-volume, ephemeral); **group messages get their own simple
  durable table** (low-volume, **never auto-purged**), e.g. `messaging.group_messages` indexed by
  `conversation_id, created_at`. Unified only at the conversation / repository / route / bus layer.
- **`messages.type`** ∈ {`text`, `poll`, `system`, `announcement`} — extends the model so polls and
  system events are messages and reuse the whole conversation infra.
- **Retention becomes conversation-type-aware:** tournament convos → §14/§15 completion-anchored purge;
  **group convos → durable** (no auto-purge).

## 4. UI manifestation — **G-UI-1…4**
- **G-UI-1 — "My Groups" tab** (bottom nav, icon **👥**, alongside 🏆/📊/🎾). Lists the player's groups →
  tap → **Group page** (**Chat · Members · invite**).
- **G-UI-2 — Group chat** = a **durable conversation stream**: text + **inline poll cards** + **system**
  events ("Sam joined"), with **sender names** (§17.5).
- **G-UI-3 — Contextual placement:** tournament chat stays in the tournament **Messages** tab;
  **no unified inbox**; unread shown as **badges on nav tabs**. (Add an aggregator later only if needed.)
- **G-UI-4 — Polls inline:** rendered as cards with a **live tally over SSE**.

## 5. Availability polls — **G-POLL-1/2**
- **G-POLL-1:** **any member** creates a poll — *question + target time*, responses **In / Out / Maybe**,
  **non-anonymous** (everyone sees who's in), **re-votable**. **Notify members on create** (§17.2 path).
- **G-POLL-2:** **auto-close optional** — if unset, **open indefinitely**. On auto-close: card **freezes**
  to final tally **and** a **`system` follow-up message** posts ("Tonight: 6 in"). Polls persist in the
  durable history.
- **Storage:** a poll = a `type=poll` message + **`poll_votes`** (`message_id`, `player_id`, `choice`,
  `voted_at`).

## 6. Group → tournament launch — **G-TOURN-1**
- **Any** availability poll can drive a tournament — it is **not** a pre-declared poll type. At any time
  the **poll creator can launch** an **unlisted, casual** tournament seeded from the current **In-voters**;
  and if **auto-close** is set, the creator may opt for it to **auto-launch on close**. The launch creates
  the tournament (**`visibility = unlisted`** + **`mode = casual`** — see §6.0) **linked via
  `tournaments.group_id`** (nullable) and posts a **`system` message** linking to it. The new tournament
  has its own *ephemeral* Messages tab (V1); the group keeps its *durable* chat. Members still register
  individually for external/open tournaments.

### 6.0 Tournament attributes — two orthogonal axes (terminology)
A tournament has **two independent attributes**; do **not** conflate them into one name (an earlier draft
called the group-launched tournament a "private tournament," which collided with "casual" — they are
different axes).

- **`mode: scheduled | casual`** — *how the engine runs* (deadlines vs none; own-match/organizer scoring
  vs open scoring; manual vs auto-advance). This is the **R-A** reconciliation axis (§6.1).
- **`visibility: public | unlisted`** — *who can see / join*. `public` = shown in `/browse` with open
  registration; **`unlisted`** = hidden from browse, joinable only by seed/link (closed roster). We use
  **`unlisted`** rather than "private" — it reads accurately for the group-launch case and avoids the
  private/casual confusion.

They combine independently (the group-launch case is just one cell):

| | **public** | **unlisted** |
|---|---|---|
| **scheduled** | today's default open tournament | club invite-only league w/ deadlines (future; ties to organizer-SaaS) |
| **casual** | open drop-in session, discoverable (future) | **group-launched ad-hoc (this design)** |

The group-launch flow (G-TOURN-1) sets **both** `visibility = unlisted` **and** `mode = casual` — as two
fields, not one renamed concept.

### 6.1 Casual mode — **G-CASUAL-1** (group-launched / ad-hoc tournaments)
Ad-hoc tournaments are **live, in-person, play-until-done** — not scheduled. They run in **casual mode**,
which differs from the deadline-driven engine (touches both this track and the **core tournament engine**):
- **No deadlines.** `registration_deadline` / `group_stage_deadline` / `knockout_stage_deadline` become
  **nullable**; when null, **no `DEADLINE_PASSED` enforcement** and no date-driven advancement.
- **Fixed roster.** Participants are the poll's In-voters at launch; **registration closed immediately**.
- **Open scoring.** **Any participant can enter/edit any current match's score** (vs. scheduled mode's
  own-match/organizer authz). **The submitter is logged** for accountability.
- **Auto-progression.** When **all current-round matches have scores**, the bracket **auto-advances** and
  generates the next round — **no organizer click, no deadline**. Completes normally
  (`tournament_complete` + `completed_at`) when the final is scored.
- **Edit window.** Scores are editable **until the round advances; locked after**; the launcher/organizer
  can **override-fix** (downstream recompute = deferred complexity).
- **Edge (defer):** a launched-but-abandoned casual tournament has no deadline to close it → optional
  auto-archive after N days idle.

> **🔧 Reconciliation (backlog R-A):** casual mode **overrides 5 documented scheduled-mode requirements** —
> deadlines `NOT NULL` (HL 705–707), partner-confirm by registration deadline (REQUIREMENTS:21),
> organizer-manual advance (REQUIREMENTS:84,140), own-match/organizer scoring, registration-deadline
> guard (REQUIREMENTS:1158). Introduce a **`tournament mode: scheduled | casual`** distinction and
> **update `rac8-4s-HL.md` + `REQUIREMENTS.md` + the affected tests within this feature's
> implementation** (don't leave the source-of-truth docs contradicting casual mode).
- Members **still register individually** for external/open tournaments (unchanged).

## 7. Data model summary (new/changed)
```
groups(id, name, created_by, default_match_format{singles|doubles}, created_at)
                                  -- created_by = audit only (was owner_player_id); §11.3
group_members(group_id, player_id, role{owner|member}, notify_level, joined_at)
                                  -- many-to-many; MULTIPLE owners allowed (§11.3)
                                  -- notify_level{all|mentions_polls|muted}; default mentions_polls (§11.7)
conversations(id, type{tournament|group}, tournament_id?, group_id?)
messages.conversation_id   (refactor from tournament_id)
messages.type{text|poll|system|announcement}
messaging.group_messages(...)   -- durable, non-purged (Option X); anonymization-ready (§12)
poll_votes(message_id, player_id, choice{in|out|maybe}, voted_at)  -- choice stored extensibly (§11.8)
messaging.group_match_log(...)  -- durable, cross-tournament; raw W/L; anonymization-ready (§11.12, §12)
tournaments.group_id   (nullable; group-launched tournaments)
tournaments.mode{scheduled|casual}          -- §6.0 / R-A; default scheduled
tournaments.visibility{public|unlisted}     -- §6.0; default public
tournaments.status += {abandoned}           -- casual terminal state (§11.14)
players.is_adult, players.age_attested_at, players.policy_version   -- 18+ gate; NO raw DOB (§12)
```
> **Anonymization-ready** = durable tables that attribute data to a player carry a nullable/replaceable
> `player_id` + a denormalized sender/participant name that can be **tombstoned** ("Former player"),
> so a verified erasure request can remove PII without destroying co-participants' records (§12).

## 8. Architectural reuse & ripples
- **Reuses the §17 multi-instance foundation:** Redis pub/sub bus (now **conversation-keyed**), the
  worker tier (poll-create + chat notifications via §17.2 `messaging.notify`), SSE, shared token store.
- **V1 refactor:** `tournament_id → conversation_id` across the messaging code/tests.
- **Retention §14/§15** becomes conversation-type-aware (durable group convos exempt from purge).
- **Notifications:** poll-create pushes to members; ongoing group chat uses **debounced/digest** notify
  (a chatty crew shouldn't email-spam) — reuse §17.2.

## 9. Resolved (grilled 2026-06-24) — see §11 for detail
All items formerly open here are now decided (§11). Summary: flat-but-**multi-owner** roles (no admin
tier); **invite-only** via email-bound magic links; **owner-kick + delete-message** as the entire GA
moderation surface (no platform reporting, no blocking); **In/Out/Maybe polls only**; **3-level per-group
mute**; **round-robin** casual format with **social-mixer doubles**; **durable cross-tournament
leaderboards**; manual **"end session"** terminal state. Compliance (DSR + 18+ gate) in §12.

### Still deferred (with triggers)
- **Custom-option polls** — trigger: a group asks for "pick a time/court" polls (chat covers it for now). §11.8
- **Elo / rating leaderboard** — trigger: a group wants a real ladder. v1 is raw W/L. §11.12
- **Knockout casual format** — trigger: groups want elimination. v1 is round-robin only. §11.10
- **7-day idle auto-archive** — gated on the shared scheduler landing (see §11.14 / backlog 🔴). §11.14
- **Self-serve DSR UI** — v1 is operator-triggered tooling only. §12

## 10. Relationship to other docs & sequencing
- **Shares the conversation/bus/worker foundation** with `MESSAGING_IMPLEMENTATION_V2.md`. The
  **`conversations` abstraction is a shared prerequisite** — build it as part of the V2 foundation, then
  this track (Groups → chat → polls → tournament-launch) layers on top.
- Suggested order within this track: **Group entity + membership → group conversation (durable storage) →
  group chat UI → availability polls → tournament launch**. TDD-first per CLAUDE.md §4/§11; a
  `PLAYER_GROUPS_IMPLEMENTATION.md` would phase it.

---

## 11. Decisions (grilled 2026-06-24)
Resolutions for every item formerly in §9, plus the §6.1 casual edges. Numbering tracks the data model.

### Membership & roles
- **11.1 — Owner leaves:** **auto-transfer** ownership to the **longest-tenured remaining member**; group +
  durable chat survive untouched. No forced handoff, no archival, no deletion. With multi-owner (11.3),
  this only fires when the **last** owner leaves.
- **11.2 — Self-leave / kick / history:** self-leave always allowed, no friction; **owner-only kick**.
  Departed members' **messages and poll votes remain as immutable history** (attribution preserved, subject
  to §12 erasure); on exit they **lose all access** (routes/SSE authz on membership) but their already-sent
  messages stay visible to those who remain.
- **11.3 — No admin role — MULTIPLE OWNERS instead.** `role` stays `{owner, member}` but `owner` is
  many-valued. Owner-only **promote member → owner / demote owner → member**; **any owner may demote or
  kick any other owner or member**. **Invariant: ≥1 owner always** (last-owner exit triggers 11.1).
  `groups.owner_player_id → created_by` (immutable audit; `group_members.role` is the sole authority).
- **11.4 — Group size:** **soft cap 12** (advisory — warn, don't block); **no minimum floor** (a 1–2 person
  nascent group is valid).

### Join / discovery
- **11.5 — Invite-only forever** (no discoverable groups). Join = **owner enters invitee email → unique,
  single-use, email-bound magic-link** (reuse `packages/api/src/auth/magic-link.ts`; extend
  `MagicLinkPayload` with `groupId`, a `type: group-invite` variant) → **email verification IS the join
  gate**. No shareable link, no approval step, no expiry/rotation logic (tokens are TTL'd + consumed on
  use). **Owner-only invites.**

### Moderation
- **11.6 — GA moderation surface = owner-kick (11.2) + owner-delete-message (tombstone "message removed").**
  **No platform reporting** (no trust-&-safety tier exists, and none is built — a report queue nobody
  triages is theater) and **no per-user blocking** (the kick covers it in a ≤12-person invite-only group).
  Explicitly **contingent on invite-only (11.5)** — if groups ever become discoverable, real reporting
  returns to scope.

### Polls & notifications
- **11.7 — Per-group notifications: a 3-level mute** on `group_members.notify_level`:
  `all` | `mentions_polls` *(default)* | `muted`. Poll-create is always high-signal; chat is digested/
  debounced (reuse §17.2). **@-mentions are in-scope for v1** (the default tier needs them).
  **Announcements** (`messages.type=announcement`) **always notify except when `muted`.**
- **11.8 — Availability polls: In/Out/Maybe only for v1.** Custom-option polls **deferred** (chat covers
  "which time/court"). Store `poll_votes.choice` **extensibly** (enum/string, not three booleans) for
  non-breaking future widening.

### Casual tournament launch (§6 / §6.1)
- **11.9 — Group default match format:** `groups.default_match_format ∈ {singles, doubles}`. Polls and the
  casual tournaments they launch **inherit** it; **overridable at launch** (default fills in, launcher may
  flip before confirming).
- **11.10 — Default bracket = single-group round-robin** (group-stage-only, no knockout) — maximizes play
  per person, copes with arbitrary N, reuses existing group-stage generation. **Knockout deferred.**
- **11.11 — Casual DOUBLES = social mixer:** teams **randomly assigned**; each round's auto-progression
  uses **best-effort partner rotation** (track past partnerships, greedily minimize repeats — not
  guaranteed-optimal); **sit-out rotation** for odd N (rest rotates ~evenly; sitting players score nothing
  that round). *This is new engine code, not reuse* (the existing doubles engine assumes fixed teams).
- **11.12 — Leaderboards:** record every casual match result into a **durable, cross-tournament group
  match log** (`messaging.group_match_log`; never auto-purged, Option-X style). Derive **two leaderboards**
  from it: a **pair** board (`{A,B}` cumulative) and an **individual** board (each player across all
  partners) — both **ranked by raw W/L + games-won** for v1. **Elo deferred.** Match data is team-vs-team
  natively, so we store once and aggregate both ways (no team-vs-individual dichotomy).
- **11.13 — Scoring & edit window:** **open scoring** (any participant edits any match), **editor logged**.
  Editable **until the tournament reaches a terminal state**, then **locked**; on every edit, recompute
  standings + leaderboard aggregates (cheap — they're derivations of the durable log). The per-round
  lock / "override-fix" / deferred-downstream-recompute language is **moot for casual v1** (round-robin has
  no elimination dependency); it returns only if knockout casual is added (11.10).
- **11.14 — Terminal state:** casual has no deadline, and "we just stopped" is the *normal* ending. v1
  must-have = **owner "end session now"** (gives a real terminal state so the existing completion-anchored
  purge can reclaim messages). **7-day idle auto-archive** → `tournaments.status = abandoned` is
  **deferred and bundled with the missing scheduler** (the same cron that retires the 🔴 unscheduled
  partition-job gap — one scheduler, three consumers: partition purge, message retention, casual
  idle-sweep). **Partial results count** toward the leaderboard; **system message** posts on close.

## 12. Compliance — CCPA/DSR & age gate
Our durable, attributable, never-purged stores (chat, poll votes, the cross-tournament match log, editor
logs, invite tokens) collide with data-subject rights. The principle: **a verified erasure request
overrides our "durable/immutable/never-purged" promises** (softens 11.2/11.12 accordingly).

- **12.1 — Data-subject-request (DSR) mechanism — IN SCOPE (operator-triggered, no self-serve UI for v1).**
  One identity (**email** = durable-player key) fans out across **all** durable stores: `group_members`,
  group chat, `poll_votes`, `group_match_log`, editor logs, live invite tokens.
  - **Anonymize-in-place (pseudonym tombstone), not hard-delete, for shared/multi-party data** — chat,
    poll votes, and the requester's **slot in match-log rows** (a doubles result has up to 4 players; you
    may not delete co-participants' records). Replace identity with "Former player"; they drop off the
    individual leaderboard (the correct outcome of "forget me").
  - **Hard-delete data solely theirs:** `group_members` rows, `notify_level`, live magic-link tokens.
  - **Recompute aggregates** after erasure (leaderboards self-heal from the anonymized log).
  - **Access/export** uses the *same* email-keyed cascade (design once, serve both export and erasure).
  - **Handler = platform operator, not group owner** (no admin/T&S tier by design; a DSR spans every group/
    tournament). **Identity verified via the magic-link/email model** before acting.
  - **Schema prerequisite:** durable tables are **anonymization-ready** (see §7 note) — design now; it's
    irreversible if we bake in hard FKs.
- **12.2 — 18+ only (no minors).** Gating to adults clears COPPA / GDPR digital-consent age / UK Children's
  Code in one stroke (don't mix minors with adults; no separate minors product).
  - **Neutral self-attested DOB screen** at onboarding (not an "I am 18 ✓" checkbox). Self-attestation is
    the appropriate bar for a general-audience low-risk app; **ID / facial age-estimation is
    disproportionate** and adds PII liability — **do not** use it.
  - **Gate at `findOrCreatePlayerByEmail`** (`packages/api/src/db.ts:363`) — the **universal** player
    boundary, so **all three entry paths** (public tournament registration `tournaments.ts:1252`, account
    signup, **group-invite accept**) inherit it. Gating at account signup alone misses the guest side door.
  - **Store the derived result only:** `players.is_adult`, `players.age_attested_at`, `players.policy_version`
    — **no raw DOB** (data minimization, lighter DSR cascade).
  - **Hard-reject under-18** at the gate (no/blocked record); **18+ stated in ToS + privacy policy**.
  - **Backfill:** one-time attestation prompt for pre-existing players at next login (block group features
    until attested).
  - **Limitation (honest):** self-attestation can be lied about; the legal standard is "reasonable measures
    + don't knowingly onboard minors + act on actual knowledge," which this meets. If a minor is later
    identified, run the 12.1 erasure cascade.
