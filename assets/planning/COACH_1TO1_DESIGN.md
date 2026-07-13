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

## 6. Non-goals (v1)

- No proactive 1:1 messages (Coach never initiates the private conversation — Phase C's
  proactive machinery stays group-scoped).
- No write actions in 1:1 beyond `propose_remember` (score cards etc. stay in the group,
  where the social context lives).
- No coach-to-coach continuity across surfaces (group Coach does not reference 1:1 content —
  hard privacy line in v1).
- No human-coach marketplace / video analysis / training-plan generation — this is a chat
  surface over existing data, not a coaching platform.
