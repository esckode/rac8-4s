# LLM Assistant in Group Chat — Design
## An @mentionable assistant that makes the app easier for players

> 🗂️ Tracked in the [project backlog](../../BACKLOG.md).

**Date:** 2026-07-10 (drafted + **fully grilled to resolution the same day** — see §10;
Phase B/C mechanics grilled 2026-07-11 — see §11)
**Status:** ✅ **Built for Phase A** (2026-07-11, A0–A9), **Phase B** (2026-07-12, B0–B7 — merged
to `main` 2026-07-12), **and Phase C** (2026-07-13, C0–C6, proactive nudges/recap/digest — see
[LLM_ASSISTANT_IMPLEMENTATION.md](./LLM_ASSISTANT_IMPLEMENTATION.md); branch
`llm-assistant-phase-c`, not yet merged to `main`). Builds on the community layer
([PLAYER_GROUPS_DESIGN.md](./PLAYER_GROUPS_DESIGN.md)) and the messaging platform
([MESSAGING_DESIGN.md](./MESSAGING_DESIGN.md) §16–§17).

---

## 1. Product framing & the decision

Players in a group chat can talk to an LLM assistant that answers questions about their tournaments
and the app, and (Phase B) drafts actions on their behalf. Product goal: **"make using the app more
easy"** — the assistant lowers the navigation cost of the app; instead of digging through
Standings/Matches/Bracket tabs, a player asks in the chat they already have open.

**Decision shape:** the assistant is a **participant in the existing conversation infrastructure**
(a bot sender in group chats, invoked by @mention), not a separate chat surface. This reuses the
whole stack — `conversations`, the durable `group_messages` store, the Redis bus/SSE fan-out, sender
names, moderation, and the DSR/retention machinery — and means assistant replies appear to all group
members like any other message.

**Surface (grilled Q2): group chat only.** Tournament chat (partitioned, completion-purged,
guest-session players, higher volume) is a different privacy/cost/retention profile — a possible
later phase, deliberately out of scope.

## 2. Architecture

```
Player message "@coach when's my next match?"
        │  (existing POST message route — returns immediately)
        ▼
Trigger detector (backend): reserved literal '@coach', case-insensitive,
checked BEFORE the player-mention parser ── no trigger ──▶ normal flow only
        │ trigger
        ▼
Assistant job on the existing Redis queue → worker tier
        │ context: group id, group-linked tournament ids, asker identity
        │ (resolveTournamentPlayer), bounded recent chat, help corpus
        ▼
Claude API (tool-use loop via @anthropic-ai/sdk tool runner)
        │ tools = thin read wrappers over EXISTING service/repo methods
        ▼
Reply inserted as group_messages row (type='assistant', player_id=NULL,
sender_name_snapshot='Coach')
        ▼
Existing Redis bus → SSE → all group members see the reply
```

Grilled placement decisions:

- **Trigger (grilled): reserved `@coach`.** Case-insensitive literal, detected server-side before
  the name-based player-mention parser runs. `coach` joins a reserved-display-names list enforced at
  signup/rename, so no player can collide with the bot. Sender renders as **Coach**.
- **Bot identity (grilled Q3): new message type `assistant`.** Migration adds `'assistant'` to the
  `type` CHECK on `messaging.messages` and `messaging.group_messages`. Bot rows:
  `type='assistant'`, `player_id=NULL`, `sender_name_snapshot='Coach'`. The explicit type (rather
  than a metadata flag) keeps bot rows unambiguous against DSR tombstones (which also have
  `player_id=NULL`) and lets the frontend style on `type` exactly as it does for `poll`/`system`.
- **Runs on the worker tier (grilled Q12)**, never in the API request path. The message POST returns
  immediately (matching the 202-async score pattern); the assistant job goes on the **existing Redis
  queue**, the reply is published on the **existing Redis bus**. **Idempotency key = triggering
  message id** so a redelivered job can't double-reply. No new single-instance state (the §17
  lesson); rate-limit counters live in **Redis**, not process memory (same class of gap as PR-1).
- **Tools are read wrappers over existing services** — the LLM never gets SQL or raw repository
  access, and never constructs its own authorization. Every tool call executes *as the requesting
  player* through the same service methods the routes use. The model can only see what the asking
  player could see in the UI.
- **Statefulness (grilled Q13): stateless per turn + chat window.** Each @coach invocation is a
  fresh API conversation: cached static prefix (system prompt + tools + help corpus) + the last
  ~20 group messages + the current mention. Because Coach's own prior replies are ordinary
  `group_messages` rows, the window carries multi-turn continuity ("and where is it?") for free —
  the group chat *is* the memory. No persisted LLM session state, no new DSR data class, no §17
  violation. Continuity fades once a topic scrolls out of the window — accepted for a Q&A bot.
  Long-term memory ("Alice prefers mornings") is explicitly out of scope (Phase C+ at most; would
  be a new durable store with its own erasure/hold obligations).
- **Failure mode:** if the API call fails, times out, or hits the loop guard, the bot posts a short
  "I couldn't answer that right now" message — never silence (a mentioned bot that says nothing
  looks broken). Loop guard: **max 5 tool-call rounds per turn**.

## 3. Tier 1 — Read-only Q&A (MVP = Phase A, grilled Q1: T1.1–T1.3 only)

| # | Feature | Tools | Notes |
|---|---------|-------|-------|
| T1.1 | Tournament state Q&A — "when's my next match?", "who do I play?", "what's the deadline?", "where do we play?" | `get_my_matches`, `get_standings`, `get_bracket`, `get_tournament` (incl. venue/courts) | Scope per grilled Q5 below |
| T1.2 | Standings "why" explanations — "why am I 3rd with the same wins as Bob?" | `get_standings` returning a **precomputed `rank_reason`** per row | The tiebreaker comparison (wins → sets won → head-to-head → coin flip) is computed **deterministically in TypeScript** where the logic already exists; the model only verbalizes it. This is the Haiku quality mitigation (§6) — the model never derives rankings itself |
| T1.3 | App how-to help — "how do I invite someone?", "what's a casual session?" | none — static help corpus in the prompt | Corpus decision per grilled Q4 below |

**Data scoping (grilled Q5): group-linked + asker's own.** Tools may read tournaments linked to this
group (`tournaments.group_id`) **plus** any tournament the asking player is registered in — i.e.
exactly what the asker can already see in their own UI. Because the reply is visible to the whole
group, detail about the asker's *unrelated* tournaments is kept minimal (the asker's own matches and
deadlines; not other tournaments' full rosters/brackets).

**Help corpus (grilled Q4): curated repo file.** `docs/assistant-help.md`, written for players
(app *mechanics* only — score format, magic links, casual mode, invites, polls), loaded into the
system prompt at service start, PR-reviewed. **House rule (add to CLAUDE.md alongside §9):
user-visible behavior changes must update `docs/assistant-help.md` in the same change.**
Per-tournament facts (venue, rules, deadlines, contact) are **never** in the corpus — they come from
the T1.1 data tools.

**Deferred from MVP (grilled Q1/Q6): T1.4 chat catch-up** ("what did I miss?"). Answering in the
public group feed reveals the asker's read position and re-surfaces messages. Trigger to revisit:
either accept the public answer explicitly, or deliver privately via the personal notification
thread (P2 infrastructure) — decide when Tier 1 usage proves demand.

## 4. Tier 2 — Write actions with explicit confirmation (Phase B)

The LLM **drafts**; the player **confirms with a tap**; the confirmed action goes through the
existing route/service with normal auth. The model never submits directly.

| # | Feature | Flow |
|---|---------|------|
| T2.1 | Score submission by NL — "beat Sunil 2-1" | Parse → match to the asker's pending match → confirm card → on tap, existing score service runs as the asker |
| T2.2 | Poll create/vote — "set up a poll for Sat 9am", "I'm in" | Drafts a G3 poll / records a vote after confirm |
| T2.3 | Casual session launch helper | Walks the poll creator through the launch config; final launch behind the existing G4.5 launch-route authorization (poll creator) + confirmation sheet. *(Corrected 2026-07-12: the drafted "owner-only" premise didn't match the shipped route — see §11 B-Q8)* |

**Write-tool registry (`propose_*`).** Even in Tier 2, **no tool in the registry mutates** — the
registry wall from §7 survives. Each write tool is a proposal generator: it runs as the asker,
validates the drafted action against current state (so we don't post a card that would fail), and
posts a confirm card as Coach's reply. The mutation happens only on the confirm tap, through the
normal API route. Tool schemas use `strict: true` so argument shapes are guaranteed valid.

| Tool | Args (strict schema) | Draft-time validation (as asker) | On confirm → normal route |
|------|----------------------|----------------------------------|---------------------------|
| `propose_score` | `tournament_id`, `match_id` *or* `opponent_name`, `score` ("X-Y") | asker is participant (scheduled) / registered (casual open scoring); match pending; score format valid; deadline not passed | `POST /tournaments/:id/matches/:matchId/score` |
| `propose_poll` | `question`, `target_time`, `auto_close_at?` | asker is group member; time in future | existing G3 poll-create route |
| `propose_poll_vote` | `poll_id`, `response` ∈ {in, out, maybe} | poll open; asker is member | existing vote route |
| `propose_casual_launch` | `poll_id` (poll-based only — no poll-less launch route exists, so the roster-config variant is deferred) | asker is the **poll creator** (mirrors the shipped G4.5 launch-route authority; corrected 2026-07-12, §11 B-Q8); poll meets the route's launch conditions | opens the existing P3 launch **confirmation sheet** (card is a shortcut into that flow, not a parallel one) → existing launch route |

Judgment call baked in: poll *votes* also go through a card for v1 — one consistent rule ("the
model never mutates") beats saving one tap. If the confirm tap proves annoying for a re-votable,
low-stakes action, relaxing votes to direct-write is a contained follow-up.

**Confirm-card mechanics (grilled Q7; storage/lifecycle refined in §11): proposer-only,
15-minute expiry.**
- The card is Coach's reply message: a `type='assistant'` row whose `metadata` carries only
  `{cardId}`, pointing at a row in the dedicated **`messaging.assistant_cards`** table (action,
  ids-only args, proposer, `expires_at`, `schema_version`, `status ∈
  pending|confirmed|failed|cancelled` — "expired" is computed from `expires_at`, never stored).
  The message `body` is a human-readable summary of the proposal (the durable/export/fallback
  record). §11 B-Q2 superseded the original metadata-borne sketch — polls set the precedent
  (042): widget state lives in its own table, the message row is the feed vehicle.
- **Only the proposer** sees active Confirm/Dismiss buttons; expired, cancelled, failed, or
  consumed cards render inert. The status flip is atomic (`… WHERE status='pending'`) so a card
  can't be replayed; state changes reach all clients via a `card.updated` bus event mirroring
  `poll.tally.updated`.
- The card is a **shortcut, never an authority**: at confirm time the server re-validates
  everything through the normal route (auth, match still pending, deadline, group membership) —
  draft-time validation is UX, confirm-time validation is the authority. Ordering is
  **mutate-first**: the existing service runs, then the card flips to `confirmed` (or `failed`
  with the rejection reason) — see §11 B-Q3.
- Casual-mode open scoring is unaffected — anyone authorized can still score via the normal UI;
  the card just isn't their vehicle.

Grilled refinements to the tool table (2026-07-11, §11): `propose_score`'s `score` is
**asker-relative** and normalized to the route's player1-relative form at draft time (args store
route-ready, ids-only values — `opponent_name` is resolved and discarded); ambiguous resolution
(two pending matches, two members with the name) yields a clarifying reply, never a card; NL
times ("Sat 9am") resolve via the asker's browser timezone captured at message POST.

## 5. Tier 3 — Proactive (Phase C, scheduler-triggered, LLM-composed)

The shared scheduler (P3.1) fires; the assistant composes a message; it posts as Coach.

| # | Feature | Trigger |
|---|---------|---------|
| T3.1 | Deadline / unscored-match nudges | New (5th) scheduler consumer over group-linked tournaments |
| T3.2 | Weekly group digest | Scheduler, per-group opt-in |
| T3.3 | Tournament recap narrative | `tournament_complete` transition for group-linked tournaments |

Most deferrable: nudge *logic* is deterministic; the LLM only adds prose. Can ship as templates
first and gain LLM composition later. **Feature-grilled 2026-07-12 — see §11 C-Q5–C-Q12** (scope
order T3.1→T3.3→T3.2, targeted nudge notifications, deadline-only nudge inventory, template
recap with gated LLM polish, three-section digest).

## 6. Model & API (grilled Q8: Haiku 4.5 only; Q17: Claude Platform on AWS)

**Vendor & channel (grilled Q17, 2026-07-11): Anthropic Claude via Claude Platform on AWS.**
Anthropic-operated with same-day API parity and **price-identical to the first-party API**
(full analysis: [cost-breakdown.md](./cost-breakdown.md)). Chosen because the prod stack is
already Terraform'd on AWS: auth is **SigV4 from the worker's EC2 instance IAM role** (no
`ANTHROPIC_API_KEY` secret to provision/rotate) and billing lands in arrears on the existing AWS
bill ($0.01 CCUs, no prepay). Client: `AnthropicAws` from **`@anthropic-ai/aws-sdk`** (requires
`AWS_REGION` + `ANTHROPIC_AWS_WORKSPACE_ID`, both mandatory); after construction the surface is
identical, so the tool-use loop is unchanged: SDK tool runner
(`client.beta.messages.toolRunner` + `betaZodTool`). One-time setup: AWS Console enrollment +
Marketplace offer + workspace creation. P-AWS lacks fast mode and cache diagnostics — neither is
used here.

**Model: `claude-haiku-4-5` for all tiers** ($1/$5 per MTok — ~$0.004–0.008 per Tier-1 turn).
Decision grilled with the quality trade-off explicit; accepted because:
- T1.1/T1.3 are "call a tool, restate structured JSON" — well within Haiku's range, and much faster
  (snappier chat UX).
- The T1.2 reasoning risk is **designed out**, not absorbed: `rank_reason` is precomputed
  server-side (§3), so the model verbalizes rather than derives.
- The model ID is an env var; **per-turn token/cost logging ships from day one**, and an upgrade
  (Sonnet 5 $3/$15, Opus 4.8 $5/$25) is a config change if quality complaints appear — "start
  cheap, upgrade on evidence."

**Response length (grilled Q16): terse, tiered 20/50.** Data answers (matches, deadlines, venue,
standings) ≤20 words, no preamble ("Saturday 9am vs Bob, Court 2."). Explanations (T1.2 "why") and
how-to (T1.3) ≤50 words. Enforced in the system prompt with concrete examples (small models respect
numeric bounds better than "be brief"); `max_tokens` ≈150 is the hard safety ceiling only — it
truncates rather than shortens, so the prompt does the shaping. A follow-up @coach question gets
more detail ("expand on request").

Request shape: no extended thinking; `max_tokens` ≈150 per the length policy above; streaming used
internally with `finalMessage()` (the reply posts whole — no token streaming into chat in v1).
**Prompt caching:** static prefix (system prompt + tool definitions + help corpus) kept stable and
≥4096 tokens (Haiku 4.5's cacheable minimum) with a `cache_control` breakpoint — up to 90% off the
input side on cache hits.

### 6.1 Caching reference — what is cached where

Three different things in this feature could be called a "cache"; they live in different places
with different lifetimes and none of them requires management code:

| What | Where | Lifetime / invalidation |
|---|---|---|
| Prompt prefix (tools + system prompt + help corpus) | **Anthropic's serving infrastructure** (server-side prompt cache; same mechanism on Claude Platform on AWS as first-party) | 5-minute sliding TTL, refreshed on every read; auto-managed |
| Help-corpus string (`docs/assistant-help.md` contents) | Worker **process memory** (sync file read at module init) | Until the next worker restart/redeploy — this is how corpus edits ship |
| Rate-limit counters (player/group/daily-budget) | **Our Redis** (`rate-limit-store.ts`) | Hourly / daily windows (Q10) |

**Prompt-cache mechanics (the first row):**
- The `cache_control: {type: 'ephemeral'}` breakpoint on the system block makes Anthropic store
  the model's computed state for the prefix, keyed by the **exact bytes** of the rendered prefix
  (render order: tools → system) plus the model ID, scoped to our organization. Nothing is cached
  client-side and there is nothing to expire on our side.
- Economics: a cache **write** bills ~1.25× input price (first request, or first after the TTL
  lapses / prefix changes); a cache **read** bills ~0.1×. During active chat hours the sliding
  5-minute TTL keeps the entry warm continuously.
- **Byte-stability is load-bearing, not stylistic:** one interpolated byte (timestamp, request id,
  user name) anywhere in the system prompt changes the cache key and every request pays full
  price. All volatile per-turn context (asker name, ~20-message window, the mention) therefore
  goes in the **user message**, after the cached prefix, where it invalidates nothing.
- **Deploys invalidate by design:** any edit to the prompt skeleton or the help corpus changes the
  prefix bytes, so the first request after a worker deploy pays one cache write and re-caches —
  negligible, no action needed. Model upgrades (Q8 env change) likewise start a fresh cache
  (caches are model-scoped).
- **Haiku minimum:** the smallest cacheable prefix on Haiku 4.5 is **4096 tokens**. Below that,
  caching silently no-ops — no error, just `usage.cache_read_input_tokens: 0`. Accepted at MVP
  scale; **do not pad the prompt to reach it.**
- **Verification:** per-turn usage logging (`assistant.replied`, §9) includes
  `cacheReadInputTokens`. Persistently zero across warm-window requests means a silent
  invalidator (non-deterministic serialization, dynamic content in the prefix) — diff the
  rendered prompt bytes between two requests to find it.

## 7. Authorization & security

**How tool use works — why the registry is a hard wall, not a convention.** The model never touches
the database, network, or code. Each API call includes the list of tool definitions (name +
JSON schema); the model's response is only ever text or a request like *"call `get_standings` with
`{tournamentId}`"*. Our worker receives that request, looks the name up in the registry, runs the
matching TypeScript function, and returns the result. The model **proposes; our code executes.** A
hallucinated or injected request for a tool that isn't registered (e.g. `update_addresses`) finds no
function and returns an error — there is no code path from model output to SQL except through
functions we wrote. This is categorically different from a prompt instruction ("don't modify
data"), which a jailbreak can talk the model out of; you can't talk your way past a function that
doesn't exist. Rule the design follows throughout: **anything security-relevant sits behind a wall
(code); only tone/topic sits in the prompt.**

- **Topic scope (grilled Q14): app + tournaments + racket sport.** Coach answers app how-to, live
  tournament/group data, and general racket-sport knowledge (rules, technique, scoring
  conventions — framed as general knowledge, not official rules). Everything else gets a one-line
  decline. Enforced in the system prompt — a strong default on a small model, **not a hard
  guarantee**; the hard properties are the structural walls below, which hold regardless of what
  the model is talked into *saying*.
- **Capability containment is structural (grilled during Q14).** Three independent walls:
  (1) **MVP has no write tools** — the model's entire action surface is the read-tool registry
  (`get_my_matches`, `get_standings`, `get_bracket`, `get_tournament`); a write path does not
  exist in the harness, so "fix all the addresses" has nothing to call. (2) **Asker-identity auth
  inside every tool** — scoping lives in the service layer, not the prompt. (3) **Tier 2 writes
  are human-confirmed** — the model only drafts an inert card; mutation happens via the normal
  route with full server-side re-validation.
- **Server-side auth is the only auth.** Tools execute as the requesting player via existing
  services; group scoping via existing membership checks. The LLM's output is never an
  authorization input.
- **Prompt injection containment:** chat messages are untrusted input, and a small model is more
  manipulable — but v1 tools are read-only *and* scoped to the asker's own visibility, so a
  successful injection can at worst make the bot say something wrong about data the group could see
  anyway. It cannot exfiltrate other groups' data or mutate state. Tier 2 keeps the property via
  the confirm tap (the human is the gate) + full server-side re-validation.
- **Secrets:** Anthropic API key in env/secret config on the worker tier; never in DB or client.
- **Guardrails (grilled Q10):** per-player **10 invocations/hour**, per-group **30/hour** (reusing
  the messaging rate-limit machinery, counters in Redis), plus a **global daily spend ceiling**
  (env-configured, e.g. $5/day) as kill-switch. At any cap the bot replies once with "I've hit my
  limit for now — try again later" — never silent. Max 5 tool rounds per turn.

## 8. Privacy, retention & compliance (grilled Q9)

- **Assistant messages live in the same conversation store** (`group_messages` via the
  `conversations` abstraction) → they inherit durability, moderation, DSR export, and — once the
  legal-hold mechanism lands — hold-awareness automatically. **The 🔴 legal-hold thread stays a
  parallel track, not a blocker**: no new un-erasable data class is introduced.
- **What goes to Anthropic:** mention text, bounded recent chat context, tool results (display
  names, scores, standings). **Emails and tokens never.** Display names are unavoidable (the data
  is about them).
- **Privacy policy gains an AI-assistant clause before launch** (feature remains flagged off until
  the clause ships).
- **DSR — best-effort scrub:** the erasure cascade extends to `type='assistant'` messages,
  replacing the erased player's snapshot name with `'Former player'` (the migration-041 tombstone
  convention). Documented as **best-effort** — prose can paraphrase a name; same residual class as
  players quoting each other today.
- **18+ gate** (G0) already covers all group members; no additional minors handling.

## 9. Moderation, rollout & testing

- **Discoverability (grilled Q15): intro message + mention picker.** (1) When the assistant is
  enabled for a group — first rollout flip or an owner re-enabling the toggle — Coach posts a
  one-time intro message ("Hi, I'm Coach 👋 — mention @coach to ask about your matches, standings,
  or how the app works."), an ordinary `type='assistant'` row through the normal pipeline. (2)
  Coach appears as a **pinned first entry in the existing `MentionAutocomplete` picker**
  (`GroupChatPanel`) with a one-line hint — so every `@` keystroke re-surfaces the bot to
  latecomers who missed the intro. No new UI surfaces.
- **Moderation (grilled Q11):** owners can delete bot messages exactly like any message
  (`type='assistant'` rows go through the same tombstone path). Group settings (P1 settings page)
  gain an **"Assistant enabled" toggle, default ON** — the toggle doubles as the per-group rollout
  flag. Trigger detection short-circuits when disabled.
- **Phases:** **A** = T1.1–T1.3, group chat, `@coach`, Haiku 4.5, per-group toggle. **B** = Tier 2
  confirm cards (score first). **C** = Tier 3 proactive + (maybe) tournament-chat surface + T1.4.
- **TDD-first per house rules:** trigger-detector, tool-wrapper auth-scoping, rate-limit, and
  `rank_reason` unit tests; a **mocked-LLM integration harness** (assert tool calls, auth context,
  and idempotency — not prose); e2e with a stubbed assistant response; scenarios in
  `e2e-scenarios.md` before implementation. ≥85% coverage gate applies. Logging per CLAUDE.md §6:
  `assistant.replied` at info with `groupId`, `playerId`, token counts; never message bodies.

## 10. Grill resolutions (2026-07-10)

All open questions were grilled to resolution with the product owner. Summary table first;
per-decision context and **rejected alternatives** follow — implementers should not relitigate
these without new evidence.

| Q | Decision |
|---|----------|
| Q1 MVP scope | **T1.1–T1.3 only**; T1.4 catch-up deferred (see §3 trigger) |
| Q2 Surface | **Group chat only**; tournament chat a possible later phase |
| Q3 Bot identity | **New `type='assistant'`** on messages + group_messages (small migration); `player_id=NULL`, snapshot `'Coach'` |
| — Trigger | **Reserved `@coach`** (case-insensitive), detected before player-mention parsing; `coach` added to reserved display names |
| Q4 Help corpus | **Curated repo file** `docs/assistant-help.md` (app mechanics only) + same-change update rule; per-tournament facts always via data tools |
| Q5 Data scope | **Group-linked + asker's own tournaments** (= asker's own UI visibility); minimal detail for non-group tournaments in public replies |
| Q6 Catch-up privacy | Deferred with T1.4 |
| Q7 Confirm card | **Proposer-only, 15-min expiry**, server re-validates at confirm; card is never an authority. Write tools are non-mutating `propose_*` generators — registry specified in §4. (Storage/lifecycle refined 2026-07-11: dedicated table, 4-state lifecycle — §11 B-Q1/B-Q2) |
| Q8 Model | **Haiku 4.5 only**, all tiers; `rank_reason` precomputed to de-risk T1.2; token logging day one; upgrade = env change on evidence |
| Q9 Compliance | **Policy clause pre-launch + names-only context + best-effort DSR scrub** of assistant messages; legal hold parallel, not blocking |
| Q10 Budget | **10/player/hr + 30/group/hr + global daily ceiling**; polite cap message; 5-tool-round loop guard |
| Q11 Moderation | **Owner delete (same path) + per-group "Assistant enabled" toggle, default ON** |
| Q12 Placement | **Existing Redis queue + worker tier; Redis counters; idempotency on triggering message id**; no new single-instance state |
| Q13 Statefulness | **Stateless per turn + ~20-message chat window** (Coach's own replies in the window give multi-turn continuity); no persisted session thread; long-term memory out of scope (Phase C+) |
| Q14 Topic scope | **App + tournaments + racket-sport knowledge**; one-line decline elsewhere. Prompt-enforced (soft); capability containment is structural — no write tools in MVP, asker-identity auth in every tool, human-confirmed writes in Tier 2 |
| Q15 Discoverability | **One-time intro message on enable + Coach pinned first in the existing mention picker** (`MentionAutocomplete` in `GroupChatPanel`) |
| Q16 Verbosity | **Terse, tiered: ≤20 words for data answers, ≤50 for explanations/how-to**; prompt-enforced with examples; `max_tokens`≈150 safety ceiling; expand on follow-up |
| Q17 Vendor/channel | **Anthropic Claude via Claude Platform on AWS** — price-identical to first-party; SigV4/IAM auth (no API-key secret); billing on the existing AWS bill; see [cost-breakdown.md](./cost-breakdown.md) |

### Decision context & rejected alternatives

**Q1 — MVP scope.** T1.1–T1.3 is the smallest surface that proves the real value (live tournament
data, not just a docs bot). Rejected: *include T1.4* (its read-position privacy question was
unresolved — see Q6); *include T2.1 score submission* (drags the entire confirm-card UX, expiry, and
versioning rules into the MVP); *help-only bot* (cheapest, but demonstrates nothing the HL doc
doesn't).

**Q2 — Surface.** Group chat is durable, members-only, and 18+-gated (G0) — the cleanest privacy
profile. Tournament chat differs on every axis: partitioned + completion-purged storage, magic-link
guest-session identities, much higher volume. Rejected: *both from day one* (guest identity, purge
semantics, and volume all unsolved); *tournament-only* (contradicts the community-layer framing of
the request).

**Q3 — Bot identity.** Context discovered during grilling: `group_messages` already has nullable
`player_id`, `sender_name_snapshot`, a `type` CHECK, and `metadata JSONB` (migrations 040/048).
Options: *(a)* `player_id=NULL` + `metadata={"bot":true}` — zero schema change, but `player_id=NULL`
is also the **DSR-tombstone convention** (migration 041), so erasure-detection queries would have to
consult metadata to disambiguate; *(b)* synthetic `players` row — mentions/FKs "just work" but a
fake human pollutes the durable-player identity model and every join/DSR path that assumes players
are people; *(c)* **new `type='assistant'`** — chosen (product owner's call over my (a)
recommendation): a small CHECK-constraint migration buys an unambiguous marker, and the frontend
already styles on `type` for `poll`/`system`.

**Trigger.** Name-based mentions are the known-fragile part of v1 (V2-grill Q11 deferral: renames,
duplicate display names). Reserving `coach` in a display-name blocklist (validated at signup/rename)
makes the bot trigger collision-proof without waiting for id-based mentions. Rejected: *unreserved
`@coach`* (a player named Coach would summon the bot and cross the notify paths); *slash command*
(unambiguous but breaks the talk-to-a-member feel and adds a new input affordance).

**Q4 — Help corpus.** Grilling clarified a split the draft blurred: the corpus holds only
**constant app mechanics** (score format, magic links, casual mode, invites, polls); anything
per-tournament — venue, rules, deadlines, contact — is **always** answered from the T1.1 data tools
reading that tournament's rows. Chosen: curated `docs/assistant-help.md`, PR-reviewed, with a
CLAUDE.md rule that user-visible behavior changes update it in the same change. Rejected:
*build-time distillation of `rac8-4s-HL.md`* (a 2000-line dev doc — SQL and internal states bleed
into player answers, and distillation quality becomes its own maintenance problem); *DB-stored +
admin UI* (a whole new admin surface for an MVP).

**Q5 — Data scope.** "Group-linked + asker's own" equals what the asker already sees in their own
UI, so nothing new leaks *to the asker*. The residual issue is that replies land in the shared
feed, so answers about the asker's unrelated tournaments are kept minimal (own matches/deadlines,
not rosters/brackets). Rejected: *group-linked only* (can't answer "when's my next match?" for
scheduled tournaments — the single most common question); *asker's full visibility* (full detail of
unlisted tournaments exposed to members who can't browse them).

**Q6 — Catch-up privacy (deferred with T1.4).** Answering "what did I miss?" in the public feed
reveals the asker's read position and re-surfaces messages. Revisit trigger: accept the public
answer explicitly, or deliver privately via the personal notification thread (P2 infra) — decide
when Tier 1 usage proves demand.

**Q7 — Confirm card.** Proposer-only keeps accountability crisp ("Bob confirmed Alice's drafted
score" muddies it); 15-minute expiry bounds stale state; server re-validation at confirm is the
authority (the card is a shortcut). Rejected: *anyone-in-scope may confirm* (flexibility isn't
worth the accountability blur in v1 — casual open scoring still works via the normal UI);
*reply-to-confirm in natural language* (the confirmation itself becomes a second LLM parse that can
err — weaker than a tap on structured args); *defer all Tier 2 design* (Tier 1 decisions — the
`assistant` type, metadata shapes — would have been made blind to the card's needs). Same-day
follow-up: the write tools were specified as **non-mutating `propose_*` generators** (§4), keeping
"no tool in the registry mutates" true in every tier; poll votes also go through a card for rule
consistency, explicitly relaxable to direct-write if the extra tap proves annoying.

**Q8 — Model (product owner's call, trade-off made explicit).** Pricing at decision time (per
MTok): Opus 4.8 $5/$25, Sonnet 5 $3/$15 (intro $2/$10 to 2026-08-31), Haiku 4.5 $1/$5 — i.e.
~$0.004–0.008 per Tier-1 turn on Haiku vs ~$0.02–0.04 on Opus. My recommendation was Opus
("start high, downgrade on evidence": T1.2 explanations are reasoning-heavy, small models are more
prompt-injectable, savings ≈ $20–35/month at MVP volume). The owner chose **Haiku 4.5 only** for
cost and latency (snappier chat UX). Accepted risks and their mitigations: T1.2 quality →
**designed out** via server-side precomputed `rank_reason` (model verbalizes, never derives);
injectability → bounded by the structural walls (§7). The model ID is an env var; per-turn token
logging ships day one; the upgrade path (Sonnet/Opus) is a config change triggered by quality
complaints, not a rebuild. Rejected: *Opus everywhere*, *Sonnet everywhere*, *split
Haiku-Tier-1/Opus-Tier-2* (two prompts + two eval sets to maintain).

**Q9 — Compliance.** Chosen: privacy-policy AI clause before un-flagging + names-only context
(emails/tokens never sent) + best-effort DSR scrub of `type='assistant'` messages using the
migration-041 tombstone convention ("best-effort" because prose can paraphrase a name — same
residual class as players quoting each other today). Rejected: *block on the 🔴 legal-hold track*
(blocks the feature on a much larger ungrilled thread; assistant messages live in `group_messages`,
so they inherit hold-awareness when that mechanism lands — parallel, not prerequisite);
*policy-line-only* (the bot systematically restates names, so skipping the scrub would amplify the
existing quote gap rather than merely inherit it).

**Q10 — Budget.** Three layers because each guards a different failure: per-player (10/hr —
individual abuse), per-group (30/hr — one enthusiastic 12-member group generating 120 turns/hr),
global daily spend ceiling (runaway loop / systemic kill-switch). On Haiku these are
abuse-protection, not cost-management. At any cap the bot replies once ("I've hit my limit for
now") — a mentioned bot that says nothing looks broken. Rejected: *global-only* and
*per-player-only* (each leaves one of the above failures open).

**Q11 — Moderation.** Owner delete comes free (`type='assistant'` rows use the same tombstone
path). The per-group **"Assistant enabled" toggle (default ON)** exists because the bot posts into
a social space — some groups won't want it — and it doubles as the rollout flag surface (P1
settings page already exists). Rejected: *no toggle* (a group can't decline the feature);
*default OFF* (considered as the gentler introduction; owner chose ON for adoption).

**Q12 — Placement.** Existing Redis queue + worker tier: zero new infrastructure, and LLM turns
(seconds) never hold an API instance's request path. Idempotency key = triggering message id so a
redelivered job can't double-reply. Rate counters in Redis, not process memory — instance-local
counters would undercount across instances (same class of gap as PR-1). Rejected: *in-process on
the API instance* (re-introduces instance-local behavior — the exact §17 mistake); *separate
assistant service* (a new deployable the worker tier can absorb).

**Q13 — Statefulness (asked as a follow-up; the draft had left "bounded context" undefined).**
Three layers were considered: within-conversation continuity, persisted session thread, long-term
memory. Chosen: **stateless per turn + ~20-message window** — because Coach's own replies are
ordinary `group_messages` rows, the window carries both sides of a recent exchange, so follow-ups
("and where is it?") resolve with zero stored state. Rejected: *persisted per-group session thread*
(a new Redis/DB state object, growing token cost, and "what did the bot know" becomes auditable
state); *long-term memory* ("Alice prefers mornings" — genuinely delightful but a new durable store
with its own erasure/hold obligations; Phase C+ at most). Accepted limit: continuity fades once a
topic scrolls out of the window — fine for a Q&A bot.

**Q14 — Topic scope (asked as a follow-up).** Grilling surfaced the load-bearing distinction
between what Coach *says* (prompt-enforced, soft) and what it *can do* (wall-enforced, hard — §7):
the owner's "what if a player asks to fix all addresses?" scenario dead-ends at the registry wall
because no write tool exists. On the say-side: **app + tournaments + racket-sport knowledge**
(kitchen rule, doubles positioning — fits the Coach persona at zero build cost, framed as general
knowledge rather than official rules), one-line decline for everything else. Rejected: *strictly
app/tournament* (a bot named Coach refusing "what's the kitchen rule?" reads as obtuse); *general
assistant* (an unmoderated general chatbot in a shared feed: off-topic sprawl, advice liability,
jailbreak bait visible to the whole group).

**Q15 — Discoverability (asked as a follow-up; the draft had no answer to "how do players learn
Coach exists?").** A mention-triggered bot is invisible without a cue. Grounding: the frontend
already ships a `MentionAutocomplete` picker in `GroupChatPanel`, so pinning Coach first there is
nearly free and re-surfaces the bot on every `@` keystroke — covering members who join after the
intro. Chosen: **one-time intro message on enable + pinned picker entry**. Rejected: *intro only*
(latecomers never learn); *picker + composer placeholder, no intro* (placeholder text is weak
signal, and skipping the announcement hides the feature's arrival); *all three* (the placeholder
adds little once the picker entry exists — noise over signal).

**Q16 — Verbosity (asked as a follow-up; owner wants terse, ~10–20 words).** A flat 10–20-word cap
fits data answers but pinches the two answer types that exist to explain: T1.2 "why" answers need
~25–40 words to name the deciding tiebreaker stat, and T1.3 how-to answers need a step or two.
Chosen: **tiered 20/50** — ≤20 words for data lookups, ≤50 for explanations/how-to — enforced in
the system prompt with concrete examples (small models follow numeric bounds better than "be
brief"), with `max_tokens`≈150 only as the safety ceiling (a token cap truncates mid-sentence
rather than shortens, so the prompt does the shaping). Follow-up questions get more detail.
Rejected: *hard 10–20 everywhere* (cryptic explanations, and each clarifying follow-up is a new
billed invocation); *concise-but-uncapped* (small models drift without concrete numbers).

**Q17 — Vendor & access channel (asked 2026-07-11; Q8 had chosen the model but not who serves
it).** Full pricing analysis in [cost-breakdown.md](./cost-breakdown.md). Key facts: the three
Claude channels (first-party API, Claude Platform on AWS, Bedrock global endpoint) are
**price-identical** for Haiku 4.5 ($1/$5 per MTok; Bedrock *regional* endpoint is +10%);
cross-vendor cost differences in the comparable model class are single-digit-to-tens of
dollars/month even at 10× MVP volume — so cost could not decide this. Decided by ops fit: the prod
stack is already on AWS (IaC build), so **Claude Platform on AWS** removes the API-key secret from
the Terraform surface (SigV4 via the worker's instance role) and puts billing on the existing AWS
bill, at zero price or code-surface penalty (Anthropic-operated, same-day parity, same SDK shape
via `@anthropic-ai/aws-sdk`). Rejected: *first-party API* (simplest generic default, but adds a
secret-management story AWS makes unnecessary here — kept as the documented fallback if P-AWS
enrollment stalls); *Bedrock* (same price on global endpoint but AWS-operated feature subset +
release lag — dominated by P-AWS); *switching vendor for cost* (GPT-mini/Gemini-Flash tiers save
~$1–4/month at MVP volume in exchange for re-speccing the SDK layer, losing the
Haiku→Sonnet→Opus upgrade path, and re-tuning prompts; the genuinely-cheaper nano/Flash-Lite
tiers are a capability class below Haiku and re-open the Q8 quality concerns).

## 11. Phase B/C mechanics grill (2026-07-11)

Grilled with the product owner before Phase B planning, to the same standard as §10 — settled;
do not relitigate without new evidence. Expanded implementation detail lives in
[LLM_ASSISTANT_IMPLEMENTATION.md](./LLM_ASSISTANT_IMPLEMENTATION.md) §B0.

| Q | Decision |
|---|----------|
| B-Q1 Card lifecycle | `pending\|confirmed\|failed\|cancelled`; **"expired" computed** read-side from `expires_at` — never stored, so no sweeper job (avoids another MESSAGING §16-class scheduled-job gap). `failed` = confirm-time revalidation rejected (reason kept); `cancelled` = proposer dismissed a bad parse |
| B-Q2 Card storage | **Dedicated `messaging.assistant_cards` table**, message `metadata` carries `{cardId}` — the poll precedent (042); supersedes §4's original metadata-borne sketch. Chosen for a real status column, FK integrity, and queryability |
| B-Q3 Confirm ordering | **Mutate first** through the existing route/service (the Q7 authority), then atomically flip `pending→confirmed` / `→failed`+reason. A flip failure after mutation is self-healing: re-confirm re-runs the service, whose own revalidation rejects the duplicate. Concurrent confirms: one mutation wins, loser gets the service rejection |
| B-Q4 Status propagation | New **`card.updated` bus event** mirroring `poll.tally.updated`; clients patch the message in place. Countdown-to-expiry is pure client-side rendering from `expires_at` |
| B-Q5 Score frame | Model emits **asker-relative** score; `propose_score` normalizes to the route's player1-relative form **at draft** (where the match row is already loaded); args store route-ready values; card displays asker-relative ("You 2 – 1 Sunil"). Keeps the correctness-critical transform out of the LLM (rank_reason precedent) |
| B-Q6 NL times | **Browser IANA timezone sent with the message POST** → job payload → user context block, together with current datetime (volatile → user message, cache-safe). No stored group timezone — known gap, revisit on demand |
| B-Q7 Ambiguity | Structured candidates/none result → **Coach asks a clarifying question; card only on unambiguous resolution.** Rejected: best-guess card (mis-parse litter in a shared feed), one-card-per-candidate (spray) |
| B-Q8 Launch deep-link | Card carries the launch config; FE CTA opens the **existing P3 launch sheet initialized from the card payload** — no new URL/route surface; the sheet's own submit is the mutation. **Correction 2026-07-12:** draft-time authority is the **poll creator**, not "group owner" — the shipped G4.5 launch route (`player-groups.ts:799`) authorizes only the poll creator, and the card must never post a flow that dead-ends at confirm. v1 is poll-based only (no poll-less launch route exists for the roster-config variant) |
| B-Q9 Card body | **Human-readable prose summary** of the proposal — the durable record for notify-fallback, DSR export, moderation view, and non-widget renders |
| B-Q10 Cards & DSR | **Ids-only args** (names resolved at draft and discarded → nothing to scrub in args); erasure cascade tombstones `proposer_player_id`; message body inherits the A9.3 exact-name scrub; cards included in the proposer's DSR export |
| B-Q11 Notify | **Coach never notifies** — assistant rows (replies and cards) are excluded from the notify pipeline (`selectNotifyRecipients` maps `type='assistant'` → ∅, tested). Applies retroactively to Phase A (structurally already true — worker-side inserts skip the route's notify block) |
| B-Q12 Phase B go-signal | **Owner judgment call** on observed Tier-1 usage (`assistant.replied` logs are the evidence base) — no numeric gate |
| C-Q1 Gating | `assistant_enabled` is the master switch for **all** Coach output, proactive included; T3.2 digest is additionally per-group opt-in (`digest_enabled`, default OFF) beneath it |
| C-Q2 Nudge dedupe | At most one nudge per (subject, milestone), deduped by querying for an existing assistant row with `metadata {nudge: '<type>:<subjectId>'}` (same mechanism as the A4 `replyTo` idempotency guard — no new state table) + a per-group proactive cap (≤2 posts/day) |
| C-Q3 Digest schedule | **Fixed weekly UTC slot**; the settings field is `digest_enabled` only. "Group-local morning" needs the group timezone the app deliberately lacks (B-Q6) — documented gap |
| C-Q4 Proactive budget | Proactive LLM turns draw from the **same global `ASSISTANT_DAILY_BUDGET_USD`** (one kill-switch stays one kill-switch); per-player/group hourly caps don't apply (no asker). Budget-exhausted proactive turns are **skipped silently** (nobody is waiting) and logged at `warn` |

Notable rejections: a stored `expired` status (needs the sweeper job §16 warns about);
claim-card-before-mutate (strands a `confirmed` card when the mutation fails, needs compensating
un-flip); wrapping card flip + mutation in one DB transaction (invasive to services that enqueue
jobs/emit events mid-flow); a group-timezone setting (drags a migration + settings UI into Phase B
for something the client already knows); notify-like-normal-messages (Coach chatter emailing
mention-level members would drive owners to the off-toggle); a numeric Phase B usage gate (false
precision for a solo-operator project — the owner reads the logs and decides).

### Phase C feature grill (2026-07-12)

Grilled before Phase C planning; C-Q1–C-Q4 above set the cross-cutting mechanics, these set the
features. Settled — do not relitigate without new evidence.

| Q | Decision |
|---|----------|
| C-Q5 Scope & order | **All three features, sequenced T3.1 nudges → T3.3 recap → T3.2 digest**, with an owner-judgment checkpoint after T3.1 ships (B-Q12 spirit) — proactive posting into a social feed is Coach's first unprompted speech; gauge reception before continuing |
| C-Q6 Nudge reach | **Targeted notify: affected players only.** B-Q11 is *scoped*, not repealed — reactive replies/cards still never notify and `selectNotifyRecipients` still maps `type='assistant'` → ∅; the nudge path directly enqueues `messaging.notify` jobs for exactly the players in the named pending matches, respecting `notify_level` (muted stays silent). Rejected: announcement-class blast (pings the whole group about someone else's match); feed-only (a nudge nobody is pushed can't change deadline behavior) |
| C-Q7 Nudge inventory | **Deadline nudges only — casual sessions exempt in v1** (no deadline, social vibe; revisit on demand). Milestones: **48h + 24h** before `group_stage_deadline`, group-linked tournaments only, each once per (tournament, milestone), skipped when nothing is unscored |
| C-Q8 Nudge text | **Name the pending matches, neutral framing** ("Bob vs Carol — unscored, 2 days left") — same information the Matches/Standings tabs already show the whole group (Q5 visibility argument); match-focused, never blame-focused. **Relative time phrasing** ("2 days left"), never absolute clock times — message bodies are static text and can't render viewer-local (B-Q6 gap) |
| C-Q9 Recap shape | **Template + LLM polish when available**: deterministic template (winner, top-3 standings, one stat — from data the standings job already computed) posts regardless; when the adapter is real (not mock) AND daily budget remains, the model rewrites the template into a short narrative — **any failure (error/timeout/budget) falls back to posting the template unchanged**, never silent, never double. Recap-polish quality joins the A0.1b-blocked live-model smoke list |
| C-Q10 Recap trigger | **Scheduler sweep**, not a PATCH hook: tournaments reach terminal status only via the organizer's generic `PATCH /:id` with no event emitted; a sweep for group-linked terminal tournaments without a recap marker (C-Q2 dedupe mechanism) matches the sweep pattern, touches zero route code, and self-heals. Recap latency of one sweep interval is irrelevant for a retrospective |
| C-Q11 Digest content | **Three template sections** — results this week, matches still pending, nearest upcoming deadline (all from existing repo queries); **all empty → no post** (a "quiet week" message trains people to ignore Coach). Standings-movement diffs rejected for v1 (needs a stored weekly snapshot — new durable data class). Default slot **Sunday 18:00 UTC** |
| C-Q12 Cap interplay | The ≤2 proactive posts/group/day cap (C-Q2) **suppresses nudges only** — recap (once per tournament) and digest (once per week) are frequency-bounded by construction and always post; suppressed nudges log at `warn` |

Grounding finding recorded during this grill: **`processAutoCloseSweep` has no production
caller** (exports exist, only tests invoke it) — the only wired recurring mechanism is the BullMQ
repeatable-cron pattern in `@worker/partition-scheduler`. Phase C sweeps copy that pattern;
the auto-close gap itself is flagged in BACKLOG.md as a pre-existing issue, out of assistant scope.

Proactive verbosity (Q16 addendum): the 20/50 tiers govern *reactive answers*; proactive posts get
their own bounds — nudge ≤40 words + the match list, recap ≤80 words, digest ≤120 words.
