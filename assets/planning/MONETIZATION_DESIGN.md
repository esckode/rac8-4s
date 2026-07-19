# Monetization — Design
## Paid player registration: guests play free, registration is the premium act

> 🗂️ Tracked in the [project backlog](../../BACKLOG.md).

**Date:** 2026-07-15 — **grilled to resolution 2026-07-15, see §2.**
**Status:** 📐 **Design (grilled)** — supersedes the wedge/pricing/rail open questions of
[MONETIZATION_STRATEGY.md](./MONETIZATION_STRATEGY.md) §6 (the strategy doc remains the
"why this model" record; this doc is the "what we decided" record). No implementation doc yet →
a `MONETIZATION_IMPLEMENTATION.md` phases the build.
**Sequencing:** launches together with the 1:1 coach behind the A9.2 privacy gate
([COACH_1TO1_DESIGN.md](./COACH_1TO1_DESIGN.md) §7 #10a) — the coach has never been live free,
so paid-from-day-one has no rug-pull. **Blocked on:** personal stats dashboard build (§4, ⚖ owner
call) + privacy-policy billing section (§6).

---

## 1. The model in one paragraph

**Guest magic-link stays free forever; player registration becomes the paid subscription.**
Guests get tournament play and the entire community layer — verified in code: groups, invites,
chat, polls, and casual tournaments all run on `requirePlayerSessionAuth` (magic-link player
sessions), and invite-acceptance mints a session directly (`player-groups.ts:334`) with no
account anywhere in the flow. A registered player account — already the gate for the 1:1 coach
(`coach.ts` excludes magic-link guests, COACH_1TO1 §7 #9) — becomes the premium bundle:
durable cross-tournament identity, `/matches` + `/standings`, the personalization profile,
the **personal stats dashboard (new build)**, and the **AI coach** as the headline.
**$10/mo list, monthly-only, 14-day card-upfront trial, $5/mo intro for the launch cohort's
first 3 months.** Stripe Billing/Checkout, US-only at launch. One paywall at one choke point:
the auth layer already distinguishes account JWTs from guest sessions everywhere, so no
per-feature entitlement checks are needed — subscription status *is* the entitlement.

## 2. Grill decisions (2026-07-15)

⚖ = owner call that diverged from the recommendation.

| # | Question | Decision |
|---|---|---|
| 1 Wedge | Which lever ships first? | **Coach-led player subscription** (via #2's SKU). Grounding: payments are 100% greenfield (no Stripe dep anywhere; `entryFee: null` in `tournaments.ts:1504` is a stub — entry fees aren't even a feature), so the §3.1 transaction fee means building entry fees **and** Stripe Connect, while this wedge is Stripe Billing on an already-built, never-launched feature. Transaction fee **remains the long-term primary** once entry fees exist; organizer SaaS deferred |
| 2 SKU | What is the paid thing? | **Paid player registration** (owner proposal, upheld by code recon). Free/paid line sits at account signup, not a feature flag. Guests lose nothing they have today; the community growth loop never touches registration. **Organizer registration pricing is explicitly parked** — owner is *not sure it stays free*; resolve in the organizer-SaaS grill |
| 3 Price | Launch price? | **$10/mo list, monthly-only** at v1 (annual waits for churn data). Cost floor for scale: pathological rate-limit-pinned coach user ≈ $5/mo, realistic heavy user well under $1/mo ([cost-breakdown.md](./cost-breakdown.md)) — priced on value, not cost recovery |
| 4 Early perks ⚖ | How are early users rewarded? | **Intro discount: $5/mo for the first 3 months** for the launch cohort, then $10 (Stripe repeating coupon; launch-window end = implementation config). Recommendation was a founding price-lock ($5 forever); owner chose to protect long-term revenue over permanent loyalty discount |
| 5 Trial | Taste before paying? | **14-day trial, card upfront** — signup goes through Stripe Checkout with `trial_period_days=14`; Stripe handles the trial-ending email. Keeps registration=subscription pure; single entitlement state machine (Stripe status). Trial abuse is bounded ≈$2.50 by existing coach rate limits |
| 6 Lapse | Cancelled / failed payment? | **Login + resubscribe wall.** Cancellation keeps access until period end (Stripe default); after lapse the account still logs in, premium surfaces show a resubscribe wall. Entitlement mirrors Stripe subscription status — no custom state. Retention: see 6b |
| 6b Lapse retention *(amended 2026-07-16)* | Why keep a lapsed customer's data indefinitely? | **Tiered — "indefinitely" withdrawn.** Owner challenge → data inventory showed the subscriber-exclusive pile is small: (a) **shared competitive/community records** — player-keyed, kept for everyone incl. guests, anonymize-on-DSR (other players' history lives in the same rows); (b) **account shell** (credentials, account→player link) — kept while lapsed (win-back; the player may still play free via magic link); (c) **billing records** — legally mandated retention regardless; (d) **coach conversation + consented memories** (the only discretionary class) — **purged 90 days after lapse** (owner opened at 30; 90 reuses the app's existing retention constant, absorbs card-expiry/vacation accidents, keeps the sweeper post-launch), **pre-purge email notice** (doubles as win-back), resubscribe within the window finds everything intact. Player-controlled valves (clear-conversation, memory delete, account deletion) unchanged |
| 7 Rail & tax | Who is merchant; who remits tax? | **Stripe Billing/Checkout, owner as merchant, US-only at launch.** US exposure negligible under state economic-nexus thresholds (~$100k/state); add Stripe Tax when volume warrants; EU (VAT-from-first-euro) deferred until demand shows. Merchant-of-record platforms (Paddle/LemonSqueezy) rejected: they can't do marketplace payouts, and the future entry-fee wedge needs Stripe Connect — one stack, not two |
| 8 IAP posture | App-store 30% on a digital sub? | Paid registration is exactly the *digital* good the 30% cut targets. **PWA-first ([FRONTEND_PLATFORM_STRATEGY.md](./FRONTEND_PLATFORM_STRATEGY.md)) is now load-bearing for monetization** — a Capacitor flip must re-grill this design (default mitigation: purchase stays web-only) |
| 9 v1 scope ⚖ | Ship existing features only, or build stats first? | **Build the personal stats dashboard before launch** so the advertised bundle is complete day one. Recommendation was existing-features-only for speed; owner chose the stronger day-one value story. Stats dashboard needs its own scope pass (§4) |
| 10 Retention levers *(2026-07-16)* | What makes staying subscribed valuable (beyond utility)? | Principle: staying **accrues** value; leaving never has value destroyed that we secretly still hold (the rejected stats-window lesson, STATS_DASHBOARD_DESIGN §3 #4). Four adopted: (a) **continuous-subscriber price lock** — rate never rises while continuously subscribed; lapse >90d → rejoin at current list price (Stripe grandfathers by default; this is a written commitment, zero build); (b) **coach memory framed as the benefit** — memory continuity + the #6b 90-day grace presented in product/privacy copy as "your coach keeps knowing your game", no new build; (c) **pause-instead-of-cancel at launch** — Stripe subscription pause offered in the cancel flow (seasonal sport, off-season churn); (d) **tenure data depth → v1.1 roadmap** — exempt active subscribers from the 90-day snapshot purge so career rank-trend arcs accrue with tenure (STATS_DASHBOARD_DESIGN §6). Not adopted (existing triggers stand): coach goals (COACH_1TO1 §5.1-B), P13 rating history |

### Amendment 2026-07-19 — launch flag (build requirement, owner-approved)

Billing ships behind a **single server-authoritative switch**: `BILLING_ENABLED`
(env, read at boot, **default off**), surfaced to the frontend via an existing
bootstrap/config response — never a build-time constant — so flipping it requires no
client redeploy. Enforcement is server-side on the billing/registration-upgrade
endpoints; the UI only reflects the flag. Flag off = exactly today's free behavior.
Rationale: the app is proven out free-first (§4 already gates launch on the stats
dashboard); the flag is the mechanical expression of that ordering and doubles as a
rollback lever post-launch. Corollary: **do not build billing dormant-but-reachable** —
no live Stripe endpoints hidden only in the UI; the gate and the endpoints land
together in the implementation plan. (SW interaction already safe: `/api/billing/*`
classifies `passthrough` — never cached, never replay-queued; PWA_CACHING_DESIGN.md D7.)

## 3. The two tiers

| | Guest (magic-link) — **free forever** | Registered player — **$10/mo** |
|---|---|---|
| Tournament play (register, brackets, scores, deadlines) | ✅ | ✅ |
| Community layer: groups, invites, group chat, polls, casual tournaments, group `@coach` | ✅ (code-verified: all on player sessions) | ✅ |
| Public discovery (`/browse`, `/tournament/:id/browse`) | ✅ (public, no session) | ✅ |
| Durable cross-tournament identity | — | ✅ |
| `/matches` + `/standings` cross-tournament views | — | ✅ |
| Personalization profile (`/profile`, `player_settings`) | — | ✅ |
| **Personal stats dashboard** (new build, §4) | — | ✅ |
| **1:1 AI coach** (+ consented memory) | — | ✅ |

The free-forever community boundary from [PLAYER_GROUPS_DESIGN.md](./PLAYER_GROUPS_DESIGN.md) /
MONETIZATION_STRATEGY §5 is **confirmed and strengthened**: it holds structurally (guests never
need an account), not just as policy. The group `@coach` stays free — it's a community surface,
already capped by `ASSISTANT_DAILY_BUDGET_USD`; only the private 1:1 coach is premium.

## 4. Build prerequisite: personal stats dashboard (⚖ #9)

Blocks launch. **Scope grilled 2026-07-16 → [STATS_DASHBOARD_DESIGN.md](./STATS_DASHBOARD_DESIGN.md):**
own `/stats` page; core four (all-time W-L + streak, standings cards w/ `rank_reason`, per-tournament
rank sparkline, match history); ⚖ casual play included as a separated section; head-to-head deferred
to v1.1. Presentation of existing data only — **P13 skill ratings**
([PERSONALIZATION_DESIGN.md](./PERSONALIZATION_DESIGN.md)) stays its own future grill.

## 5. Subscription lifecycle (Stripe-status-driven)

```
signup → Stripe Checkout (card, trial_period_days=14, launch coupon $5×3mo)
  trialing ──14d──> active ($5×3 → $10)
  active ──cancel flow──> pause offered first (#10c) ──> paused ──resume──> active
  active ──cancel──> active-until-period-end ──> lapsed
  active ──payment fails──> past_due (Stripe dunning) ──> lapsed
  lapsed ──resubscribe ≤90d (1 click, everything intact, original rate #10a)──> active
  lapsed ──resubscribe >90d (coach data purged #6b, current list price #10a)──> active
```

- Entitlement check = "Stripe subscription status ∈ {trialing, active, past_due-in-grace}" on
  account-JWT surfaces; guests are simply never entitled. No new entitlement tables beyond a
  `stripe_customer_id` / subscription-status mirror on the account (webhook-updated).
- Lapsed = login works; coach, `/matches`, `/standings`, profile, stats show the resubscribe
  wall. Player-keyed data untouched; **coach conversation + memories purge 90 days after lapse**
  (#6b): notice email ~day 75 → scheduled sweeper deletes at day 90 (`type='coach'` conversation +
  `player_memories` rows). Must be a **scheduled job** — the unscheduled-partition-jobs gap
  (MESSAGING_DESIGN §16) is the anti-pattern to avoid repeating.

## 6. Compliance & policy touchpoints

- **Privacy policy** (`/privacy`, shipped with the coach build) gains a **billing section**:
  Stripe as payment processor, what it receives (email, card — card never touches our servers;
  Checkout is hosted, PCI SAQ-A scope), subscription-status storage. This edits the same page
  already gating A9.2 — **owner re-approval covers both**.
- **US-only enforcement** at Checkout (billing-address restriction); international = deferred,
  revisit with Stripe Tax + OSS if demand shows.
- **DSR/deletion**: unchanged — account deletion cascades as designed; add Stripe customer
  deletion to the cascade.
- **Retention statement** in the privacy policy (#6b): coach conversation + memories deleted 90
  days after subscription lapse (with notice); competitive records kept as shared tournament
  history (anonymize-on-DSR); billing records kept as legally required.
- **Product-copy commitments** (#10): the price-lock promise ("your rate never increases while
  continuously subscribed") appears wherever price is shown; coach memory continuity + the 90-day
  grace framed as a subscriber benefit in the same copy, consistent with the privacy page's
  memory section.
- `docs/assistant-help.md` must gain pricing/subscription answers in the same change
  (CLAUDE.md §9 — user-visible behavior).

## 7. Parked / deferred (with triggers)

| Item | Status | Trigger to revisit |
|---|---|---|
| **Organizer registration pricing** | ⏸️ Parked — owner explicitly unsure it stays free | Organizer-SaaS grill |
| Entry-fee transaction fee (§3.1 strategy) | Long-term primary, unbuilt | Entry fees become a feature → grill Stripe Connect details |
| Organizer SaaS (§3.3 strategy) | Deferred | Organizer demand signals; grill with organizer-registration pricing |
| Local sponsorship (§3.4 strategy) | Opportunistic, ungrilled | First inbound sponsor interest |
| Annual pricing | Deferred | Churn data exists (~6 months post-launch) |
| EU / international sales | Deferred | International signups blocked-at-Checkout counter shows demand |
| Capacitor / app-store distribution | Deferred (now monetization-load-bearing, #8) | Would force a re-grill of this design |

## 8. Relationship to other docs

- [MONETIZATION_STRATEGY.md](./MONETIZATION_STRATEGY.md) — the "why this model" framing (§2
  personas, §4 why-not-ads); its §6 open questions are resolved here except the parked items (§7).
- [COACH_1TO1_DESIGN.md](./COACH_1TO1_DESIGN.md) — the headline SKU feature; A9.2 gate is the
  shared launch gate; cost levers make margin predictable.
- [cost-breakdown.md](./cost-breakdown.md) — unit economics behind #3.
- [PLAYER_GROUPS_DESIGN.md](./PLAYER_GROUPS_DESIGN.md) — the free-forever boundary this design
  structurally preserves.
- [FRONTEND_PLATFORM_STRATEGY.md](./FRONTEND_PLATFORM_STRATEGY.md) — PWA-first, now
  monetization-load-bearing (#8).
- [PERSONALIZATION_DESIGN.md](./PERSONALIZATION_DESIGN.md) — P11 trends feed the stats
  dashboard (§4); P13 ratings stays its own future grill.
- Next: `MONETIZATION_IMPLEMENTATION.md` (Stripe integration, signup-flow rework, resubscribe
  wall, webhook mirror, stats-dashboard scope pass first).
