# 1:1 Coach — Design (pre-grill draft)
## A private per-player Coach conversation for performance, tactics, and strategy

> 🗂️ Tracked in the [project backlog](../../BACKLOG.md).

**Date:** 2026-07-13
**Status:** 📝 DRAFT — **not grilled.** Extends the @coach assistant
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

## 4. Open questions for the grill

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
  down); staleness (memories rot — surface age? prompt to re-confirm?).

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
re-engagement signal; the K/visibility rules for C *if* it is ever revisited.

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
  proactive machinery stays group-scoped).
- No write actions in 1:1 beyond `propose_remember` (score cards etc. stay in the group,
  where the social context lives).
- No coach-to-coach continuity across surfaces (group Coach does not reference 1:1 content —
  hard privacy line in v1).
- No human-coach marketplace / video analysis / training-plan generation — this is a chat
  surface over existing data, not a coaching platform.
