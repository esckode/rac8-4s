# Monetization Strategy — Draft
## How the app makes money: who pays, for what value

> 🗂️ Tracked in the [project backlog](../../BACKLOG.md).

**Date:** 2026-06-24 · **Revised:** 2026-07-15 (added §3.2 player premium subscription — the 1:1 AI
coach shipped after the first draft and creates the first player-side SKU)
**Status:** 📐 DESIGN — **grilled 2026-07-15 → [MONETIZATION_DESIGN.md](./MONETIZATION_DESIGN.md)**,
which resolves the §6 open questions (wedge = **paid player registration**, $10/mo, guests free
forever). This doc remains the "why this model" record; §6 items not covered there are parked with
triggers (MONETIZATION_DESIGN §7).

---

## 1. Framing — the decision is "who pays you, for what value"

The recurring question is posed as **"ads vs. app-store fee."** Both framings are weak:

- **"App-store fee" is not a revenue model** — it's the 15–30% Apple/Google take *from* you. With the
  [PWA-first decision](./FRONTEND_PLATFORM_STRATEGY.md) (Capacitor deferred), the app mostly **avoids
  the stores** — a reason to favor models that don't route through them.
- **Ads** are *one* answer to "who pays," and a poor fit here (see §4).

The real question: **which persona has willingness to pay, and for what.**

## 2. Where the value (and willingness to pay) sits

| Persona | What they get | Willingness to pay |
|---|---|---|
| **Organizers** | Run/manage tournaments — brackets, scoring, deadlines, registration | **High** — a tool that saves real work |
| **Players (competitive)** | Register, see brackets, get alerts | Low directly; pay **into** tournaments (entry fees) |
| **Group regulars** (community layer — [Player Groups](./PLAYER_GROUPS_DESIGN.md)) | Availability polls, group chat, casual tournaments | Low directly; high **engagement / retention** value |

**Money concentrates on organizers and on funds already flowing through the app (entry fees) — not on
players paying for chat.**

> **Revision 2026-07-15:** the [1:1 AI coach](./COACH_1TO1_DESIGN.md) (built & merged, still dark behind
> the A9.2 privacy gate) is the first **player-facing feature with real per-user marginal cost and
> personal value** (match prep, "am I getting worse?"). It creates a credible player-side willingness
> to pay that didn't exist when the table above was written — see §3.2.

## 3. Recommended model (priority order)

### 3.1 Transaction fee on entry-fee payments — **PRIMARY**
The standard model for tournament/event platforms (Eventbrite, PickleballBrackets, league apps). When an
organizer charges an entry fee, the app processes payment (e.g. Stripe) and takes a **small service fee**
— flat (`$1–2/registration`) or percentage (`3–5%`). Scales with delivered value, **no paywall friction**,
and the payer is already transacting.

> **App-store note:** entry fees are payment for **real-world services** and are generally **exempt** from
> Apple/Google's 30% IAP cut (which targets *digital* goods/subscriptions). This makes the transaction-fee
> model **more durable** than a player-subscription model if the app later ships via Capacitor.

### 3.2 Player premium subscription (1:1 AI coach) — **LIKELY FIRST TO SHIP** *(added 2026-07-15)*
Gate the [1:1 AI coach](./COACH_1TO1_DESIGN.md) behind a monthly player subscription (working figure:
**$10/mo**, to be grilled — $5 / $10 / annual).

- **Price on value, not cost.** With the mandatory cost levers (history cache + player snapshot), a warm
  Haiku turn costs ~$0.002–0.007; a pathological user pinned at the 60-turn/day rate limit costs
  **≈$5/mo**, a realistic heavy user **well under $1/mo** ([cost-breakdown.md](./cost-breakdown.md)).
  $10/mo is ~10× worst-case cost — defensible as a premium price, indefensible as "cost recovery."
- **Why it may ship first:** the coach is already built and **has never launched free** (A9.2 gate), so
  paid-from-day-one has no rug-pull problem — and a subscription gate on an existing feature is a far
  smaller build than Stripe Connect entry-fee processing (§3.1).
- **⚠️ Digital-good caveat:** unlike entry fees (§3.1's app-store exemption), an AI subscription is
  exactly the *digital* good Apple/Google's 30% IAP cut targets. Moot under
  [PWA-first](./FRONTEND_PLATFORM_STRATEGY.md); this SKU weakens if the Capacitor decision ever flips.
- **Free boundary:** the **group `@coach` assistant stays free** (community surface, already capped by
  `ASSISTANT_DAILY_BUDGET_USD`); only the private 1:1 coach is premium. Whether a free taste
  (N messages/mo) exists as a funnel is a grill question.

### 3.3 Organizer subscription / freemium — **SECONDARY**
- **Free tier:** small / casual tournaments — **keep [casual mode (G-CASUAL-1)](./PLAYER_GROUPS_DESIGN.md)
  free** as the growth loop.
- **Paid tier:** larger fields, recurring leagues, branding, **analytics** (builds on the
  language/locale analytics already captured), priority features.
- Payer is the **organizer** — the persona that will pay monthly for a tool that runs their club.

### 3.4 Local sponsorship — **OPPORTUNISTIC**
A contextual "sponsored by [local pickleball shop]" slot on a tournament / bracket page. Monetizes the
community surface **without programmatic ads** degrading it.

## 4. Why not ads

- **Scale math fails.** Display ads need large DAU; a niche app on a single `t2.micro` earns cents while
  paying a UX cost.
- **Poisons the community bet.** The [Player Groups](./PLAYER_GROUPS_DESIGN.md) thesis is that the social /
  availability layer *spawns play* and drives retention — ads in group chat / availability polls undercut
  exactly that.
- **Wrong payer.** Ads monetize players (low willingness) instead of organizers / entry-fees (where value is).

## 5. How it maps onto existing design

- **Casual mode stays free** — the friction-free hook that gets groups onto the platform.
- **Monetize the "serious" path** — scheduled tournaments w/ entry fees → transaction fee; recurring
  organizer use → subscription.
- **Monetize the personal path** — the 1:1 coach ([COACH_1TO1_DESIGN.md](./COACH_1TO1_DESIGN.md)) is a
  private per-player surface, so gating it does **not** touch the free-forever community boundary. Its
  cost side is already bounded (per-player 20/hr + 60/day rate limits, global
  `ASSISTANT_DAILY_BUDGET_USD` kill-switch), so subscription margin is predictable.
- **Capacitor stays deferred** — but if the app enters the stores, IAP rules force the 30% cut on *digital*
  subscriptions; **entry-fee transaction fees are generally exempt** → another reason the transaction-fee
  wedge ages better.

## 6. Open questions for the grilling session

- **Which lever is the wedge** — transaction fee vs. organizer SaaS **vs. coach subscription (§3.2)** —
  and which ships first? (§3.2 is the smallest build and has no rug-pull risk while the coach is dark.)
- **Coach subscription shape (§3.2)** — price point ($5 vs. $10 vs. annual); free taste (N messages/mo)
  as a funnel vs. hard gate; payment rail for a subscription *without* Stripe Connect (simple Stripe
  Billing?); does it bundle with a future organizer tier?
- **Pricing shape** — flat per-registration vs. percentage; free-tier limits (field size? # tournaments/mo?).
- **Payments integration** — Stripe Connect (organizers as connected accounts / payout) vs. simpler;
  refunds, disputes, payout cadence; PCI scope.
- **Tax / compliance** — sales tax / VAT on service fees by region (ties to the locale data already captured).
- **Who sets the entry fee** — organizer-defined; does the app ever take a cut of $0 (free) tournaments?
- **Subscription surface** — what's actually gated behind paid (analytics, branding, field size, leagues)?
- **Sponsorship mechanics** — self-serve vs. manual; placement rules so it stays non-intrusive.
- **Community monetization boundary** — confirm groups/polls/casual mode remain free forever (retention),
  and where (if anywhere) a paid group feature could sit.

## 7. Relationship to other docs
- Depends on the [PWA-first / Capacitor decision](./FRONTEND_PLATFORM_STRATEGY.md) (store-fee implications —
  doubly so for §3.2, a digital good).
- The free-forever boundary is set by [Player Groups / casual mode](./PLAYER_GROUPS_DESIGN.md).
- §3.2 gates the [1:1 coach](./COACH_1TO1_DESIGN.md); unit costs come from
  [cost-breakdown.md](./cost-breakdown.md). The coach's A9.2 privacy-gate launch sequencing interacts
  with paid-from-day-one.
- A later `MONETIZATION_IMPLEMENTATION.md` would phase the chosen wedge (payments integration first).
