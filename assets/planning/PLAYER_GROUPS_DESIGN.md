# Player Groups & Availability — Design
## Durable groups, group chat, availability polls, group-launched tournaments

> 🗂️ Tracked in the [project backlog](../../BACKLOG.md).

**Date:** 2026-06-24
**Status:** 📋 DESIGN (grilled) — not started. A **new product track** (community layer), distinct from
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
  the **poll creator can launch** a private tournament seeded from the current **In-voters**; and if
  **auto-close** is set, the creator may opt for it to **auto-launch on close**. The launch creates a
  private tournament **linked via `tournaments.group_id`** (nullable) and posts a **`system` message**
  linking to it. The new tournament has its own *ephemeral* Messages tab (V1); the group keeps its
  *durable* chat. Members still register individually for external/open tournaments.

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
groups(id, name, owner_player_id, created_at)
group_members(group_id, player_id, role, joined_at)              -- many-to-many
conversations(id, type{tournament|group}, tournament_id?, group_id?)
messages.conversation_id   (refactor from tournament_id)
messages.type{text|poll|system|announcement}
messaging.group_messages(...)   -- durable, non-purged (Option X)
poll_votes(message_id, player_id, choice{in|out|maybe}, voted_at)
tournaments.group_id   (nullable; group-launched tournaments)
```

## 8. Architectural reuse & ripples
- **Reuses the §17 multi-instance foundation:** Redis pub/sub bus (now **conversation-keyed**), the
  worker tier (poll-create + chat notifications via §17.2 `messaging.notify`), SSE, shared token store.
- **V1 refactor:** `tournament_id → conversation_id` across the messaging code/tests.
- **Retention §14/§15** becomes conversation-type-aware (durable group convos exempt from purge).
- **Notifications:** poll-create pushes to members; ongoing group chat uses **debounced/digest** notify
  (a chatty crew shouldn't email-spam) — reuse §17.2.

## 9. Open / deferred
- **Moderation/abuse:** social group chat **re-introduces a moderation surface** the tournament design
  avoided (reporting, blocking, leaving a group). Needs a policy before GA.
- Custom-option polls (beyond In/Out/Maybe); group **admin** role; **group discovery/privacy** (invite-only
  vs discoverable); per-group **notification preferences**; default **bracket format** for group-launched
  tournaments; member **removal/leave** flows; what happens to a group's chat when the **owner leaves**.

## 10. Relationship to other docs & sequencing
- **Shares the conversation/bus/worker foundation** with `MESSAGING_IMPLEMENTATION_V2.md`. The
  **`conversations` abstraction is a shared prerequisite** — build it as part of the V2 foundation, then
  this track (Groups → chat → polls → tournament-launch) layers on top.
- Suggested order within this track: **Group entity + membership → group conversation (durable storage) →
  group chat UI → availability polls → tournament launch**. TDD-first per CLAUDE.md §4/§11; a
  `PLAYER_GROUPS_IMPLEMENTATION.md` would phase it.
