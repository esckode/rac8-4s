# 1:1 Coach — Design
## A private per-player Coach conversation for performance, tactics, and strategy

> 🗂️ Tracked in the [project backlog](../../BACKLOG.md).

**Date:** 2026-07-13 (drafted); **grilled to resolution 2026-07-14 — see §7.**
**Status:** ✅ **Built** (2026-07-14/15, see [COACH_1TO1_IMPLEMENTATION.md](./COACH_1TO1_IMPLEMENTATION.md)'s
Definition of done). Extends the @coach assistant
([LLM_ASSISTANT_DESIGN.md](./LLM_ASSISTANT_DESIGN.md), Phases A–C merged to `main`); referenced
as the "later phase" of [PERSONALIZATION_DESIGN.md](./PERSONALIZATION_DESIGN.md) §4.
**Sequencing:** after the personalization foundation tier (P0–P5) + its reception checkpoint;
benefits from P11 (trends) and P12 (availability) but is not blocked by them.

---

## 1. Product framing

The group-chat-only decision (assistant design Q2) was right for Q&A — but it structurally
excludes the performance-improvement use case: **you can't ask how to beat Bob in a chat Bob
reads**, and "am I getting worse?" costs pride in front of friends. Those are precisely the
questions the persona's *name* promises. A 1:1 Coach conversation is the only viable surface
for them.

What makes this differentiating (vs. any generic chatbot): Coach's tactics talk is **grounded
in the asker's real match data** — history, scores, standings, `rank_reason`, and (once P11
exists) streaks and head-to-head records. "You've dropped three tiebreaks in a row — want to
talk about closing out sets?" is something only this app can say.

The 1:1 surface is also the natural home for three already-deferred items:
- **T1.4 chat catch-up** (deferred on read-position privacy — private delivery was its named
  revisit trigger);
- **personal digest** delivery (PERSONALIZATION §3.1);
- **opt-in Coach memory** (formerly PERSONALIZATION P13, absorbed here as a sub-decision —
  see §5): in a private thread the public-reply leak class that made standalone memory a poor
  fit simply doesn't exist.

## 2. Grounding — what already exists (verified 2026-07-13)

- **The conversation substrate is built.** Migration 046 added `type='personal'` conversations
  — exactly one per player (partial unique index), currently used for system notifications
  (kick/promote/auto-transfer); `conversation-repository.ts` has get-or-create support.
  The 1:1 surface either reuses this thread or adds a sibling `type='coach'` (grill question).
- **The assistant stack is fully reusable:** job queue + worker processor, `AssistantClient`
  adapter (mock/real), rate limiter, prompt-cache discipline, structured usage logging, DSR
  scrub precedent, `type='assistant'` message rendering.
- **The read tools exist** (`get_my_matches`, `get_standings`, `get_bracket`,
  `get_tournament`) but their `AssistantToolContext` is **built per-group** — a 1:1 turn needs
  a player-level context variant (union of all the asker's groups + own registrations; still
  strictly asker-visible data, the Q5 invariant).

## 3. What changes relative to group-chat Coach

| Dimension | Group chat (shipped) | 1:1 (this design) |
|---|---|---|
| Trigger | reserved `@coach` mention | none — **every message in the thread is a turn** (every message costs a model call) |
| Reply audience | whole group | asker only — Q5's "minimal detail for non-group tournaments" constraint **relaxes** (full own-data detail is fine) |
| Verbosity | terse 20/50 (Q16) | conversational — needs its own tier (grill) |
| Rate limits | 10/player/hr (generous for pings) | too tight for a conversation — needs retuning (grill) |
| Moderation | owner delete + group toggle | **no owner exists** — say-side prompt is the only content control; structural walls (read-only tools, asker scoping) hold identically |
| Topic scope | app + tournaments + racket sport (Q14) | same, **plus** coaching-specific rules: technique framed as suggestions; **hard decline for injury/medical-adjacent asks** (new liability boundary) |
| Model stakes | verbalize precomputed data | tactics advice is where Haiku's limits would actually show — likeliest trigger for Q8's "upgrade on evidence" (Sonnet for this surface only?) |

## 4. Open questions for the grill *(all resolved 2026-07-14 — see §7)*

1. **Surface:** reuse the `personal` thread (Coach replies interleave with system
   notifications) vs. a new `type='coach'` conversation per player (clean separation, one more
   migration). Leaning: separate type — mixing coaching chat into the notification thread
   muddies both.
2. **Trigger economics:** every 1:1 message is a billed turn. Rate limit (20/hr? 30/day?),
   per-player daily token budget share, and whether the group `assistant_enabled` toggle has
   any bearing (leaning: no — 1:1 is player-level, gated by its own opt-in/visibility).
3. **Model choice for this surface:** Haiku everywhere (consistent, cheap) vs. Sonnet for 1:1
   only (quality where it matters, two configs). Q8's framework says start Haiku, upgrade on
   evidence — but tactics-quality complaints are predictable; decide the trigger in advance.
4. **Opponent scouting boundary:** "how do I beat Bob?" synthesized from Bob's *visible* match
   history — normal sport behavior (everyone reads the standings) or decline opponent-profiling
   and discuss only the asker's own game? This is the grill's hardest product call.
5. **Say-side coaching rules:** technique-as-general-suggestions framing; injury/medical hard
   decline wording; whether "performance" talk about other players is bounded (ties to #4).
6. **UI placement:** pinned "Coach" conversation in the messages/groups list; entry points
   (from a match card? from standings?); does it exist for players in zero groups?
7. **Retention & DSR:** 1:1 rows live in the same store (inherit export/erasure); is coaching
   history worth a shorter retention window than group chat? Any privacy-policy clause update
   (the A9.2 clause covered group-visible assistance)?
8. **Moderation without an owner:** accept prompt-only content control (walls still hold), or
   add player-side "clear conversation"? Jailbreak attempts are invisible in a private thread —
   decide eyes-open.
9. **Verbosity tier:** conversational but bounded (e.g. ≤120 words, expand on request?);
   longer coaching answers are the point — but unbounded drift is not.
10. **Memory sub-decision — see §5.**

## 5. Sub-decision: opt-in Coach memory (absorbed from PERSONALIZATION P13)

Long-term memory = a durable per-player fact store re-injected into turns (models remember
nothing between calls). In the group surface this was a poor fit (public-reply leaks,
stale-memory embarrassment in front of the group); in a 1:1 it becomes tractable:

- **Write path:** player-dictated or Coach-suggested, but always **consented via the Phase B
  card pattern** (`propose_remember` → confirm tap) — the registry wall's "no tool mutates"
  rule survives, and every memory is explicitly player-approved. No silent auto-extraction.
- **Store:** small `player_memories` table (player_id, body, source, created_at), hard cap
  (~20 entries) so full injection stays cheap — no retrieval machinery at this scale.
- **Read path:** injected into the **user message** (never the cached system prompt —
  byte-stability rule, assistant design §6.1). 1:1-scoped in v1: memories are read/written
  only in the private thread (whether group-surface Coach may read them is a separate,
  later decision).
- **Inspect/forget:** "what do you know about me?" (read tool) + a settings list with delete
  buttons (better UX than conversational forget); full DSR export + erasure cascade from day
  one — the `assistant_cards` precedent.
- **Grill:** opt-in UX (per-player toggle, P0 preferences store); what Coach may propose to
  remember (preferences yes; inferences about skill/behavior no — boundary needs writing
  down); staleness (memories rot — surface age? prompt to re-confirm?). *(Resolved
  2026-07-14 — §7 #7a–7c.)*

### 5.1 State architecture — does 1:1 need long-term state, and how?

Strictly no for v1 — but 1:1 coaching is the first surface where cross-session state has real
product value, so the approach is chosen deliberately here rather than inherited from Q13 by
default. "State" is four layers with different answers:

1. **Conversation continuity — free.** The 1:1 thread is durable message rows; replaying the
   last N into each turn (the Q13 mechanism) covers within-session and cross-day continuity
   with zero stored state. It works *better* than in group chat: no interleaved chatter, so
   the same window covers far more coaching ground.
2. **Performance trajectory — not LLM state at all.** "Has my tiebreak record improved?" is
   answered by querying match data at turn time via the tools (better still once P11
   trends/snapshots exist) — the rank_reason philosophy: **derive, don't remember**. Most of
   what users would perceive as "Coach remembers my progress" needs zero stored state.
3. **Personal facts — the §5 memory store.** Stable, player-consented facts. Already designed.
4. **Conversational arc across weeks** ("last month we worked on your net game — how's it
   going?") — the only layer with a genuinely open choice once the thread outgrows the window:

| Option | Mechanism | Verdict |
|---|---|---|
| **A. Bigger window (v1 choice)** | Raise the 1:1 replay window (~40–60 messages; single-topic threads make this go far). Input-token cost only; zero new data class; fully Q13-consistent | **Ship v1 with this** |
| **B. Goal objects (first upgrade)** | Remember *commitments*, not conversation: Coach proposes "Set a goal: …?" → confirm card → typed `player_goals` row (goal, status, created_at), injected each turn. Same consent/inspect/erase properties as §5 memory — a second memory category with a lifecycle. Captures most cross-week value ("how's the thing we were working on?") | **Adopt when usage shows cross-week re-engagement** |
| **C. Rolling LLM-written summary** | Model updates a compact thread summary every K turns, injected in place of scrolled-out history. The industry pattern for long-running assistants — but it is **auto-extraction by another name**: silently-written LLM prose about a person (conflicts with the consent posture), a new DSR row nobody reviewed, and a Haiku-quality drift risk where a wrong summary poisons every later turn. If ever adopted: player-visible, clearable, regenerable, its own data class | **Deferred behind evidence that A+B are exhausted** |
| **D. RAG / embeddings over history** | Vector retrieval over the full thread. Wrong tool at this scale — threads are hundreds of messages at most; a vector store is a new infra class dominated by A–C | **Rejected** |

Non-option, named to kill a false assumption: **the vendor provides no state.** The Anthropic
API is stateless per request; the prompt cache is a 5-minute, exact-bytes cost optimization —
it is not memory and cannot be bent into it. All state is ours to store, consent, inject, and
erase.

**V1 stance: layers 1+2+3 (bigger window + data-derived trends + consented memory) — no new
state mechanism beyond §5. First upgrade: B. C held behind evidence. D dropped.**
**Grill:** window size N (token cost vs continuity); whether B ships in v1 or waits for the
re-engagement signal; the K/visibility rules for C *if* it is ever revisited. *(Resolved
2026-07-14 — §7 #4 window=50, #8 B held for evidence; C untouched.)*

### 5.2 `propose_remember` on the Phase B card machinery — mapping, reuse, deviations

The Phase B pattern (shipped, assistant design §4 + §11): `propose_*` tools never mutate —
they validate as the asker and create a card (`assistant_cards` row + assistant message with
human-readable `body`); the mutation runs only on the proposer's Confirm tap, **mutate-first**
through the same service the normal UI uses, then an atomic `pending→confirmed` flip
(`UPDATE … WHERE status='pending'` — no double-mutation on replay/race); `card.updated`
live-patches all clients; dismiss → `cancelled`; expiry computed from `expires_at`, never
stored; prompt rule *"never claim an action happened — the card does it."*

**Why it fits memory:** the card pattern is a consent machine, and consent is memory's hard
problem. Each memory is individually approved (no silent auto-extraction, structurally); the
confirmed card is a **standing audit record of exactly what was consented and when**; the
15-minute expiry kills stale proposals; the atomic flip prevents duplicate rows; the prompt
rule stops Coach acting as if it remembered something unconfirmed. Flow: player (or Coach's
offer) → `propose_remember({text})` → draft validation as asker (opt-in on, cap has room,
length limit, near-duplicate check) → card *"Coach wants to remember: '…'. Only you can
confirm."* → Confirm → memory service inserts the `player_memories` row → flip → confirmed
card. Cap re-checked at confirm (revalidation is the authority) → `failed` + reason if it
filled meanwhile. **Forget needs no card** — deleting your own memory is the low-stakes
direction (the same logic as the design's poll-vote relaxation note); the settings-list
delete button is the vehicle.

**Reused unchanged:** `assistant_cards` table + repository (`createCard`/`claimCard`
atomicity), lifecycle + computed expiry, `card.updated` event path, the `ActionCard` FE shell
(new variant, same states), confirm/cancel route skeleton, `MockAssistantClient` router
pattern for deterministic e2e, the prompt rule.

**Deviations — the genuine new work (1 is decided; 2 remains a grill item):**
1. **Scope generalization — decided (2026-07-13): key cards on `conversation_id NOT NULL`,
   not a nullable `group_id`.** Everything Phase B built is group-scoped; the 1:1 thread is a
   `personal` conversation with no group. A *nullable* `group_id` was considered and rejected:
   erasure mechanics wouldn't break (the DSR cascade finds cards by `proposer_player_id`,
   group-blind), but "NULL = personal scope" becomes load-bearing semantics — the same class
   of NULL-marker the codebase already paid for once (`player_id=NULL` = DSR tombstone, the
   reason Q3 bought an explicit `type='assistant'`) — and every future group-keyed
   retention/moderation/purge query (`WHERE group_id = …`) would **silently exclude** personal
   cards: a quiet compliance blind spot, doubly bad given #7 contemplates a distinct retention
   window for coaching content. Instead: `assistant_cards.conversation_id NOT NULL`
   (FK → `messaging.conversations`, which already models both scopes — `type='group'` and the
   046 `type='personal'`); scope is derived from `conversations.type`, explicitly; retention
   sweeps get a first-class handle; a denormalized `group_id` may be kept for the existing
   group-route auth checks (denormalized-but-never-authoritative is fine; nullable-and-
   load-bearing was the thing to avoid). **The system is not live, so this is a schema change
   to the existing `assistant_cards` table, not a migration-with-backfill.** The confirm/cancel
   routes still need a personal-scope sibling (Phase B plumbing is touched — regression
   surface on shipped group cards). **Required test:** a [RED] erasure test seeded with a
   personal-scope card, asserting the cascade tombstones/scrubs it — the blind-spot class is
   guarded by a test, not convention (the A9.3 playbook applied to the new scope).
2. **The ids-only args rule breaks, deliberately.** B-Q10's posture was "args carry ids, never
   prose — nothing to scrub." `propose_remember`'s args *are* personal prose (the text is the
   thing being consented). The DSR erasure cascade must therefore explicitly cover
   `assistant_cards.args` for `action='remember'` rows, plus `player_memories` itself — the
   one place the pattern's compliance story needs new work instead of inheritance.

The content boundary ("preferences yes, inferences no") stays a prompt-level rule, but the
card makes every violation **visible and refusable pre-write** — the player sees exactly what
Coach wants to store before it exists. That's a structural backstop the group surface never
had.

## 6. Non-goals (v1)

- No proactive 1:1 messages (Coach never initiates the private conversation — Phase C's
  proactive machinery stays group-scoped). **Held absolute in the grill (§7 #11c): the
  personal digest does not get a carve-out.**
- No write actions in 1:1 beyond `propose_remember` (score cards etc. stay in the group,
  where the social context lives).
- No coach-to-coach continuity across surfaces (group Coach does not reference 1:1 content —
  hard privacy line in v1).
- No human-coach marketplace / video analysis / training-plan generation — this is a chat
  surface over existing data, not a coaching platform.

**Named post-v1 follow-ups (grilled 2026-07-14):** T1.4 chat catch-up (privacy blocker now
resolved by this surface; needs a new chat-content read tool class + read-position semantics);
personal digest (arrives as an opt-in notification/inbox shape, not an unprompted Coach
message); goal objects (§5.1 Option B, on the cross-week re-engagement signal).

## 7. Grill resolutions (2026-07-14)

Grilled to resolution with the product owner; same standard as the assistant design §10/§11 —
settled, do not relitigate without new evidence. Owner calls against the drafted
recommendation are marked ⚖.

| # | Decision |
|---|----------|
| 1 Surface | **New `type='coach'` conversation, one per player** (046 pattern: widen the type CHECK + partial unique index; lazy get-or-create on first open). Reuse of the `personal` notification thread rejected: with every-message-is-a-turn semantics, any reply to a kick/promote notification would silently become a billed Coach turn; separation also keeps retention scope and the §5.2 card FK semantics clean |
| 2 Economics | Every message is a turn; per-player **20/hr + 60/day** (existing Redis rate-limit machinery); the shared global `ASSISTANT_DAILY_BUDGET_USD` stays the one kill-switch (C-Q4 principle). **Near-limit heads-up:** when a turn leaves ≤3 messages in either window, the worker appends a one-line footer to that reply ("⚠ 3 messages left this hour") — deterministic string, no extra model call; polite cap message at the limit as today. Group `assistant_enabled` has **no bearing** — an owner's control over their social space doesn't reach a player's private surface |
| 3 Model ⚖ | **Haiku 4.5 + mandatory cost levers** (owner call; Sonnet-for-1:1 was the recommendation — tactics generation has no rank_reason-style mitigation). The levers are **v1 requirements, not later optimizations** — the naive replay shape is simply wrong for a conversation surface: (a) a second `cache_control` breakpoint on the conversation history, so warm-session turns re-read prior history at 0.1× and pay full rate only on new tokens; (b) a **deterministic player snapshot** (next match, standings row + `rank_reason`, last ~5 results; ~300 tokens from existing queries) injected into the user context so most turns need zero tool rounds. Config: new `COACH_MODEL` env var (group surface keeps `ASSISTANT_MODEL`). **Pre-agreed upgrade trigger** (no re-grill): first genuine tactics-quality complaint, or owner dogfood judgment → flip `COACH_MODEL` to Sonnet. Cost with levers: ~$0.002–0.007/warm turn on Haiku; pathological 60-turn/day ceiling ≈ $5/mo/player, realistic heavy user well under $1/mo (Sonnet would be ~3×; naive no-lever Sonnet was ~$60/mo pathological — the number that forced the levers) |
| 4 Turn shape | **≤120 words** default, expand on request; embedded data lookups ("when do I play next?") stay terse — the 20-word tier carries over per answer *type*, not per surface; `max_tokens` ≈500 safety ceiling only; replay window **50 messages** (riding the history cache; single-topic 1:1 threads make 50 messages cover weeks) |
| 5 Scouting | **Allowed, stats-grounded only** — normal sport behavior; everyone reads the standings. Opponent analysis must cite visible results (scores, records, streaks — the P11 store) and be framed as gameplay advice for the asker; **no personality/temperament/behavior profiling of the opponent** ("Bob has lost 4 of 5 tiebreaks" yes; "Bob cracks under pressure" never). Boundary text is a design deliverable, prompt-enforced; the structural wall already limits data to asker-visible |
| 6 Medical line | **Symptoms vs. general practice.** Anything referencing the asker's own pain/injury/symptom/recovery/medication → hard decline with one warm sentence pointing to a physio/doctor (wording written at design time, not improvised). General warm-ups, conditioning, prevention, strain-reducing technique stay allowed under the Q14 general-knowledge framing ("how do I avoid tennis elbow" answers; "my elbow hurts when I serve" declines) |
| 7a Memory opt-in ⚖ | `player_settings.coach_memory_enabled` **default ON** (owner call; default-OFF was the recommendation) — the per-memory confirm card remains the real consent gate; `/profile` gains the toggle + a memories list with per-entry delete buttons |
| 7b Memory bounds | Coach may propose only **player-stated facts** (preferences, equipment, self-declared goals/focus areas, logistics); it never proposes its own inferences about skill/temperament/behavior — offering the inference for archival is itself the harm. Player-dictated memories ("remember that I…") accept anything within length/cap limits |
| 7c Staleness | **Age-annotated injection** ("[noted 3 months ago] prefers morning matches") so the model hedges old facts; created_at shown in the `/profile` list; prompt nudges conversational re-confirmation of plainly stale entries. No TTL, no re-confirm cards, no sweeper (C0 lesson) |
| 8 Goals | §5.1 Option B **held for evidence**, per the doc stance — trigger: cross-week re-engagement visible in usage logs. Goal-flavored memories captured under 7b are migration candidates when B lands, so nothing is wasted |
| 9 UI | Pinned **Coach** entry at the top of the existing messages/conversations list; renders as a normal conversation; lazily created; one-time intro message on first open (Q15 adapted). Exists for **every authenticated player** — zero-group players included (they're exactly who lack a group surface); magic-link guests excluded, matching where messaging sits. Deep-link entry points (match card / standings → "ask Coach") deferred to v2 |
| 10a Retention & policy | Coaching history keeps the **same durable retention** as group chat — no auto-purge sweeper; clear-conversation (10b) is the user-controlled valve; `type='coach'` makes a later purge query trivial. **Privacy policy: discovery during the grill — no policy document exists anywhere in the app** (the DobScreen "Privacy Policy" text is a dead span) and the missing A9.2 clause is already the launch gate keeping Phases A–C dark. **Decision: write the privacy-policy page as part of this build** — static page + link wiring, with an AI section covering group-visible assistance (A9.2's debt), the private 1:1 conversation, the consented memory store (what's stored, player-approved, how to delete), and what leaves the system (message text + display names to the model vendor; never emails/tokens). One page clears both gates; owner reads/approves the final text before it gates anything |
| 10b Moderation | **Prompt-only say-side control, accepted eyes-open** — the structural walls are the guarantee and a successful jailbreak's only audience is the jailbreaker — **plus player-side "clear conversation"** in v1: hard-delete of the coach-thread message rows (no shared-feed integrity to preserve in a 1:1; not tombstones). Memories survive a clear — they have their own delete controls |
| 11a DSR | Confirmed §5.2: erasure cascade explicitly covers `assistant_cards.args` for `action='remember'` rows + the `player_memories` table; the [RED] personal-scope card erasure test ships before the implementation |
| 11b T1.4 catch-up | **Deferred — named first follow-up.** Its privacy blocker is resolved by this surface, but it's a summarization feature needing a new tool class (chat-content reads) + read-position semantics; v1 stays coaching-focused |
| 11c Personal digest | **Deferred — the "Coach never initiates" non-goal stays absolute in v1.** Future shape: opt-in notification/inbox-style delivery, not an unprompted Coach message |
