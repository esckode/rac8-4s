# Tournament Location & Discovery — Design
## Where a tournament is, and "find tournaments near me"

> 🗂️ Tracked in the [project backlog](../../BACKLOG.md).

**Date:** 2026-07-25 — **grilled to resolution 2026-07-25, see §3 (D1–D13; D14 added same day).**
**Status:** 📐 **Design (grilled)** — surfaced 2026-07-21 during the UAT walkthrough
([BACKLOG.md](../../BACKLOG.md) "Open design threads"). No mechanism exists today and the data
model does not support one.
**Completes:** [PERSONALIZATION_DESIGN.md](./PERSONALIZATION_DESIGN.md) **P1c** — the venue tier
of the timezone hierarchy, unwireable since 2026-07-13 because tournaments↔locations linkage
never existed.
**Owner calls carried:** ⚖ D11 (no multi-venue — a spread-out event is a region; players
coordinate the meeting spot in chat).

---

## 1. Framing

Two tournament classes need different things from a location, and the difference is **who has to
find it**:

- A **group-launched casual session** is played by a social circle that already knows where "the
  usual place" is. It is `visibility='unlisted'`, invisible to strangers by construction, and a
  name is sufficient.
- A **public/professional tournament** has to advertise itself to people who have never been
  there. It needs something a stranger can navigate to — an address, a named public facility, or,
  when the event is spread out or the courts aren't fixed yet, a county or metro area.

The v1 goal is a **"Near me" sort on `/browse`** plus an honest location on the tournament detail
page. Everything below follows from making exactly that work without over-modelling.

## 2. Grounding — what exists today (verified 2026-07-25)

| Thing | State | Bound |
|---|---|---|
| `tournaments.mode` / `.visibility` | `scheduled\|casual` / `public\|unlisted` (migration `044`) | **Orthogonal axes**, not one concept |
| Tournament location data | **None.** No venue, `location_id`, or lat/lng on `TournamentRow` (`db.ts:29`) | Browse sorts `created_at DESC` |
| `public.locations` (migration `005`) | `name`, `sport`, `lat/long` **`REAL`**, `total_courts`, `restricted`, `entry_conditions`; `timezone` added by `053` | **No link to tournaments, no routes, zero production callers.** `REAL` is too coarse for a street address; `sport`/`total_courts` are `NOT NULL` — a poor fit for a general venue |
| `LocationRepository.findNearby` (`db.ts:1442`) | lat/long bounding box, default radius **25 m**, no `cos(lat)` correction | A venue geofence, not a discovery radius. Zero callers |
| `public.courts` (migration `006`) + `locations.total_courts` | Exists, `CourtRepository` exists | **Fully orphaned** — no `court_id` reference anywhere in the schema |
| `locations.timezone` | Column exists (`053`) | **Read by nothing.** `group-timezone.ts` resolves player→group only |
| Match scheduling | **Does not exist** — `group_matches`/`knockout_matches` carry only `created_at`/`updated_at` | Per-day / per-match venue assignment is not expressible at all |
| Geocoding / maps | **No code, no dependency, no vendor** | `@aws-sdk/client-sesv2` already present |
| `POST /tournaments` | Never accepts `visibility` (`routes/tournaments.ts:248`); repo defaults `'public'` (`db.ts:234`) | Only group-launch paths set `'unlisted'` |
| Postgres extensions | **Zero.** No `CREATE EXTENSION` in any of 60 migrations, none in `infra/` | Any extension needs provisioning in local dev, the test DB, CI, *and* RDS |
| Browse pages | `/browse` → `BrowseTournaments.tsx`, `/tournament/:id/browse` → `TournamentBrowse.tsx` | Format chips filter **client-side over one page** of results |
| URL logging | None (`pino-http`/`morgan`/`originalUrl` absent); no CloudFront/ALB access logs in `infra/` | Access logging is itself an open item (`BACKLOG.md:220`) |

## 3. Decisions (grilled 2026-07-25)

### D1 — The gate is `visibility`, not `mode`

`visibility='public'` ⇒ a findable location is required. `visibility='unlisted'` ⇒ free text only,
**and it is never geocoded**.

The requirement exists because strangers must find the event, which is precisely what `visibility`
means. Keying it to `mode` would break both crossing cases: a **public casual** park mixer needs a
real address, and an **unlisted scheduled** friends' league does not.

*Consequence:* `POST /tournaments` must start accepting `visibility`, and tournament create/edit
needs a visibility control. Today organizer-created tournaments are always `public`.

### D2 — Enforced at the publish transition

The gate fires on `draft → registration_open` (`POST /:id/advance`, `routes/tournaments.ts:315`)
with `400 LOCATION_REQUIRED`. Drafts may be incomplete, so an organizer can create a tournament
before the venue is settled.

**Verified airtight:** `advance` is the only writer of `registration_open`, and `draft` is excluded
from Browse (`db.ts:299`). Therefore *every public row in Browse is guaranteed to have a location*
— the invariant the whole discovery feature rests on.

### D3 — Venues are shared, ownerless, address-keyed, immutable

Globally searchable and reusable: any organizer may reference any existing venue. There is **no
`owner_id`**, no edit permissions, and no moderation surface — which matters, because
`routes/admin.ts` contains exactly one DSR route and no moderation UI at all.

This works because the **provider's place id is the identity**. Dedupe is a unique-index lookup
rather than fuzzy string matching, and the address is immutable: changing it doesn't correct a
venue, it makes a *different* venue. Nothing on the row is arbitrable, so nothing needs an owner.

*Rejected:* organizer-scoped catalogs (duplicate rows, blocks future venue aggregation);
owner-only-edit with propagation (needs an ownership model to arbitrate names); copy-on-reuse
(same duplication problem).

### D4 — One input box; precision derived from the provider

A single autocomplete field accepts a name *or* an address, and the provider's place type
determines the shape:

| Organizer types | Provider returns | `place_precision` |
|---|---|---|
| "FAU rec center" | establishment + name + address | `venue` |
| "777 Glades Rd, Boca Raton" | street address | `address` |
| "Boca Raton" | locality | `city` |
| "Palm Beach County" | administrative area | `region` |

Precision is **derived, never chosen by the organizer**. Regions live in the same table — the
picker renders provider predictions, not our rows, so there is nothing to pollute. The provider's
map-view bounding box supplies the region extent, so no radius is ever typed by hand.

### D5 — AWS Location Service (`geo-places`), adapter-shaped

**Decisive finding:** Google Maps Platform permits storing `place_id` indefinitely but caps Places
lat/lng caching at **30 days**. That disqualifies a durable local geo table — the coordinates
"Near me" queries would never legally be ours, making the whole design a refresh treadmill. AWS
sells the opposite: a per-request `intendedUse=Stored` that permits storing results *indefinitely*.

- **Two calls are mandatory.** `Storage` is unsupported on Autocomplete/Suggest, so:
  `Autocomplete(SingleUse, Label bucket)` → `PlaceId` → `GetPlace(intendedUse=Stored)`.
- **Timezone comes free.** `TimeZone` is an Advanced-bucket feature, but the Stored price *caps* a
  call requesting any feature — so `GetPlace(additionalFeatures=[TimeZone], intendedUse=Stored)`
  returns name + address + coords + IANA tz in one storable call, populating the whole venue row
  and completing P1c at no extra cost.
- **`GeocoderAdapter` + mock, `GEOCODER` env var** — mirrors the existing `EMAIL_SERVICE`
  mock/SendGrid/SES pattern. Infra is an **IAM policy only**; the `aws_location_place_index`
  resource is the *legacy* API model and is not needed.
- **Cost is not a factor.** Lookups happen once per *new venue*, not per tournament: ~50 new
  venues/month ≈ 250 Autocomplete + 50 `GetPlace(Stored)` ≈ **under $1/month**, inside the free
  tier. Same conclusion `cost-breakdown.md` §7 reached for LLM vendors.
- ⚠ **Build-time gate (the one unverified risk):** POI name quality was not empirically checked —
  it needs a live key. **Smoke-test ~6 real South Florida venues** (e.g. "FAU rec") before wiring
  the UI. The adapter boundary makes bailing out a one-module change.

Sources: [Google Places policies](https://developers.google.com/maps/documentation/places/web-service/policies) ·
[AWS IntendedUse](https://docs.aws.amazon.com/location/latest/developerguide/places-intended-use.html) ·
[AWS Places pricing buckets](https://docs.aws.amazon.com/location/latest/developerguide/places-pricing.html)

### D6 — Completes PERSONALIZATION_DESIGN P1c (not a conflict)

P1c already specified `locations.timezone` as the venue tz tier, with group-linked casual
tournaments (**no venue**) inheriting the group tz — consistent with D1. That tier has been dead
because the linkage didn't exist. `GetPlace` now supplies the IANA tz, and venue-linked public
tournaments render venue-anchored times in it. FE-rendered timestamps continue to use the viewer's
browser tz, per P1c.

### D7 — All provider calls proxied through the API

```
GET  /geo/autocomplete?q=…    → Autocomplete(SingleUse)  → predictions
POST /geo/resolve  {placeId}  → GetPlace(Stored)         → upsert locations, return row
```

No credential ever reaches the browser; the instance-role chain is reused (SES precedent). Abuse
is bounded by the existing rate limiter, and the mock adapter means unit and e2e tests need no
network. Latency is one extra hop per keystroke, which a 300 ms debounce absorbs.

⚠ **`/geo/*` is a new top-level mount — it MUST be added to the CloudFront behavior list**
(`infra/modules/frontend`, CLAUDE.md §9 / `IaC-implementation.md` Step 6) or the path silently
routes to S3 and returns HTML instead of JSON.

*Rejected:* browser-direct calls — the client would issue the `Stored` call, meaning untrusted
input decides what gets persisted into **shared** venue rows and at what billing tier, which makes
D3's address-as-identity guarantee unenforceable.

### D8 — The player's position: coarsened, transient, never stored

The client rounds coordinates to **2 decimals (~1.1 km)** before they leave the device. That is
ample for tournament discovery, useless as a home address, and it makes responses CDN-cacheable on
a grid (full precision would destroy the hit rate). Precise coordinates are never transmitted,
stored, or logged.

Optionally, a coarse **home area** — a city/region place reference, *never* precise coordinates —
is saved in `player_settings` (migration `052`), so "Near me" survives a denied permission prompt
and persists across sessions. It is set through the same autocomplete box.

Nothing precise exists to erase on a DSR request, and `player_settings` already cascades on
`player_id`. This satisfies the "non-storage of precise location" constraint recorded in the
backlog item.

*Rejected:* storing precise coordinates (pulls location into the DSR cascade, the open legal-hold
gap, and the privacy policy); a POST search endpoint (turns a public read into a POST and kills
Browse caching for accuracy nobody needs).

### D9 — Opt-in "Near me" **sort** on `/browse`, not the default

```
Chips:  [All] [Doubles] [Singles] [Mixed] [📍 Near me]
```

Default order stays newest-first. Tapping the chip requests permission, then re-queries
**server-side** sorted by distance.

**A sort, not a filter** — this is the load-bearing choice. At launch the catalog is nearly empty,
so a radius filter would show a blank page, which reads as a broken app rather than an empty
market. A sort degrades gracefully: distant tournaments sink but remain.

Fallback chain: permission denied → saved home area → "Set your area" via the autocomplete box.
Geolocation is never requested on page load; a public route firing a permission prompt before any
user intent is both a poor first impression and reflexively denied.

**Distance display is governed by precision** — showing "1.3 mi" for a county is false precision:

| `place_precision` | Rendering |
|---|---|
| `venue` / `address` | `1.3 mi · FAU Recreation Center` + map pin + directions |
| `city` | `~5 mi · Boca Raton` (coarse band) |
| `region` | `Palm Beach County` — **no distance shown** (still sorted by centroid) |

Units: miles (US-only launch, consistent with Stripe US-only in `MONETIZATION_DESIGN.md`). The
existing client-side format chips are left exactly as they are — out of scope.

### D10 — Plain SQL haversine + bbox prefilter. Zero extensions

```sql
WHERE lat BETWEEN $lat - $d AND $lat + $d
  AND lng BETWEEN $lng - $d/cos(radians($lat)) AND $lng + $d/cos(radians($lat))
ORDER BY <haversine> ASC
```

A btree index on `locations(latitude, longitude)` is sufficient well past this project's scale. The
prefilter runs against `locations` (small) and joins to `tournaments`. Region extent folds in as
`distance <= user_radius + extent_radius_km`.

Extensions were rejected on operational grounds, not technical ones: this project has **zero**
extensions today, and PostGIS or `cube`+`earthdistance` would have to be provisioned in four
environments to solve a scale problem that does not exist. PostGIS remains the migration target
*if* regions ever need real polygon containment instead of centroid+radius.

⚠ The `cos(lat)` correction is exactly what the existing `findNearby` gets wrong.

### D11 — One location per tournament. No multi-venue *(⚖ owner call)*

A tournament has **at most one** location (`1:0..1` nullable FK). A multi-site or spread-out event
is simply `place_precision='region'`; the address where players actually meet is coordinated
between them in group chat, which already exists.

This deletes an entire subsystem from the design: no `tournament_venues` join table, no
`sort_order`, no `on_date`, no per-tournament labels, no primary-venue selection, and no
denormalized `search_lat/lng` on `tournaments`.

**Supporting finding:** per-day and per-match venue assignment was never expressible — matches
carry no scheduled date or time at all, so it is blocked on match scheduling, a feature that
doesn't exist. `courts` is likewise orphaned with no `court_id` reference anywhere.

### D12 — Extend the existing code in place; touch nothing else

`LocationRepository` has **no production callers but 49 passing tests** across `locations.spec.ts`
(530 lines) — well-covered code, not untested dead code. Deleting it would drop coverage floors
through no fault of this feature (§13).

- **`findNearby` is fixed in place** — it is the wrong-shaped predecessor of our query, so it's in
  scope: add the `cos(lat)` correction, replace the 25 m default with a real discovery default, and
  honor `extent_radius_km`. Zero production callers means no blast radius; only its own tests are
  amended.
- **`courts` / `CourtRepository` are left untouched** and recorded here as unrelated dead code,
  per §3 ("mention it — don't delete it"). They may matter if match scheduling ever lands.

### D13 — Test surface

- **NEW** `packages/frontend/e2e/location-discovery.spec.ts` — owns the full arc, because it needs
  its own `test.use({ geolocation, permissions })` contexts: organizer autocomplete → pick → venue
  saved; publish gate blocks a public tournament with no location; `unlisted` + text publishes
  fine; permission **granted** → distance sort; permission **denied** → home-area fallback; a
  region row shows its name and **no** distance.
- **EXTEND** `browse-tournaments.spec.ts` (8 → ~10) for distance rendering.
- **EXTEND** `player-groups.spec.ts` for D14: the group default seeds a launched session; a
  **non-owner member** edits the session location successfully; the change appears as a system
  message in the group conversation; a **non-member** is rejected.
- **EXTEND** `assistant-actions.spec.ts` for D15: the launch sheet shows the inherited location and
  is editable before confirm; "@coach we're at Patch Reef" drafts a card rather than mutating; the
  confirmed card writes and posts the 📍 notice. Requires `npm run dev:worker` (§8 — `JOB_QUEUE=bullmq`
  routes @coach replies through the queue).
- **ADD** the selection-map row to `e2e-scenarios.md` §"Test Organization" in the same change (§8).
- **jest:** `/geo/*` routes, `GeocoderAdapter` against the mock, haversine + bbox math (pure and
  the most error-prone part), the publish-gate guard, and place-id upsert dedupe.
- `GEOCODER=mock` with **deterministic fixtures** so autocomplete assertions are stable.
- Per §13, the frontend chip and permission flow are e2e-only and will read as uncovered against
  the frontend floors. Do not write jest tests purely to move that number.

### D14 — Unlisted location: a group default, seeded at launch, editable per session

D1 gives unlisted tournaments free text, but it can't be typed on the main path: **poll
auto-launch is a worker** (`auto-close-processor.ts:91`) with no human in the loop — name
generated, `sport` hardcoded. The manual launch (`player-groups.ts:934`) accepts only `sport` +
`matchFormat`. So the location has to originate at the **group**, not the session.

`player_groups.default_location_text`, set by the owner in group settings and **copied onto the
tournament at launch** by both paths — mirroring the existing `default_match_format` precedent
(migration `039`). Copy-at-launch, not a live FK read.

**Three change cases, all covered:**

| Case | Mechanism |
|---|---|
| **Permanent move** — the group's usual place changes | Edit `default_location_text`. Copy-at-launch means only *future* sessions inherit it; past sessions keep their snapshot, which is the correct history |
| **One-off** — "this Saturday we're at Patch Reef" | Edit the session's own `location_text` |
| **Rotation** — the group alternates between a few spots | Same editable session field; the default seeds the most common one |

**Any group member may edit a session's location** — consistent with casual mode's deliberately
loose posture, where open scoring already lets any participant report any match. The member who
finds out the courts are flooded is usually not the owner. Social visibility is the control, not
permissions: **a change posts a system message into the group conversation** ("📍 Location changed
to …"), reusing the `postSystemMessage` machinery the launch flow already uses, so every change is
visible and attributable.

⚠ **This needs its own route.** `PATCH /tournaments/:id` (`routes/tournaments.ts:1663`) is
unusable here on two counts: it calls `requireOrganizerAuth` (group members hold *player* tokens)
and `assertOrganizerOwnsTournament(creator_id)` (only the creator passes). The location edit is a
player-authed route guarded by group membership, resolved via `tournaments.group_id` →
`player_group_members`. That membership check exists only inline (`player-groups.ts:1292`) — there
is no shared helper.

**Group locations are free text and are never geocoded** — D1's privacy rule, not an omission.
"Mike's court" is frequently a residence; geocoding it would send a private address to a third
party and persist precise coordinates for it. The provider stays entirely on the public-tournament
side of this design.

*Accepted limitation:* a group that rotates between three spots weekly retypes the location each
time. A managed shortlist (`player_group_locations` + a picker) was considered and judged
disproportionate for a social group of ~8 who coordinate in chat continuously — and auto-launch
would still need a designated default regardless, so a list would only ever serve the manual and
edit paths.

*Forward-compatible:* v2 can swap the group default from text to a `location_id` without touching
either launch path.

### D15 — @coach sets and updates the location, addressed-only, card-gated

Casual launches run through @coach, so location has to reach both the launch moment and later
changes. Two mechanisms, no new architecture:

**At launch — the existing sheet gains one field.** `propose_casual_launch` opens
`LaunchConfirmSheet`, which already renders an **editable `matchFormat` seeded from the group's
`defaultFormat`**. A location field seeded from `default_location_text` is the identical pattern in
the same component, and it serves the direct launch path too. So the initial location needs no new
tool — it's set where the format already is.

**Later changes — a new `propose_location_change` tool.** Registry-wall, like every other write
action: it drafts a card, a member confirms, the D14 route writes, and the 📍 system message posts.
Its args are scalar, so it uses the **route-ready generic confirm dispatch** (as `propose_score`
does) rather than `propose_casual_launch`'s bespoke-sheet path.

**Draft-time authority = group membership**, mirroring D14's route. Note this is deliberately looser
than `propose_casual_launch`, which restricts to the *poll creator*. Two different authority rules
will coexist in the registry, and each must mirror its route exactly — that file's header records a
2026-07-12 correction where the tool assumed "group owner" and the route said "poll creator" (B-Q8).
Getting this wrong is a known bug class here, not a hypothetical.

**@coach acts only when addressed** — including conversationally: *"@coach courts are flooded, we're
at Patch Reef tonight"* is a normal tool call, since that message mentions it. What is explicitly
**not** built is inferring a move from chat @coach wasn't addressed in. That would breach all three
of the assistant's standing principles simultaneously: `trigger.ts:9` is mention-only (reading all
group messages is a privacy and token-cost change), `recap.ts` establishes "precompute server-side,
the model only ever verbalizes or polishes" (the model never interprets chat as truth), and it would
mean acting on intent nobody confirmed. The failure modes are ordinary group chat: hypotheticals
("what if we tried Patch Reef?"), a joke, next week's plan, an argument that never resolved. If it's
ever wanted, it needs its own grill.

*Required in the same change:* `docs/assistant-help.md` — @coach's capabilities change, and that
file is loaded into its system prompt (§9).

## 4. Schema

```sql
-- locations: shared, ownerless, immutable, provider-resolved
ALTER TABLE public.locations
  ADD COLUMN place_id TEXT UNIQUE,           -- provider identity (D3) → dedupe by index
  ADD COLUMN address_label TEXT,             -- provider formatted address
  ADD COLUMN city TEXT, ADD COLUMN region TEXT,
  ADD COLUMN postal_code TEXT, ADD COLUMN country TEXT,
  ADD COLUMN place_precision TEXT
    CHECK (place_precision IN ('venue','address','city','region')),
  ADD COLUMN extent_radius_km REAL,          -- from the provider bbox; regions only
  ALTER COLUMN latitude  TYPE DOUBLE PRECISION,   -- was REAL: ~10 m slop at FL longitudes
  ALTER COLUMN longitude TYPE DOUBLE PRECISION,
  ALTER COLUMN sport DROP NOT NULL,          -- a venue isn't inherently one sport
  ALTER COLUMN total_courts DROP NOT NULL;
-- locations.timezone already exists (053) — finally read by something (D6)

-- tournaments: two columns, mutually exclusive by visibility (D1)
ALTER TABLE public.tournaments
  ADD COLUMN location_id TEXT NULL REFERENCES public.locations(id),
  ADD COLUMN location_text TEXT NULL;        -- unlisted only, never geocoded

-- the group's "usual place", copied onto casual sessions at launch (D14)
ALTER TABLE public.player_groups
  ADD COLUMN default_location_text TEXT NULL;

CREATE INDEX idx_locations_coords ON public.locations(latitude, longitude);
```

`public` ⇒ `location_id` required at publish (D2); `location_text` may carry extra detail.
`unlisted` ⇒ `location_id` NULL, `location_text` only.

**No backfill.** Existing rows get `location_id = NULL`. The publish gate only fires on *future*
`draft → registration_open` transitions, so already-published tournaments keep working; they render
"Location not specified" and are excluded from the distance sort. `location_text` on an unlisted
tournament is free text that may reference a residence — it is never geocoded, and inherits
whatever DSR treatment the tournament row already has.

## 5. Decision summary

| # | Decision | Note |
|---|---|---|
| D1 | Gate on `visibility`, not `mode` | `public` ⇒ findable; `unlisted` ⇒ text, never geocoded |
| D2 | Enforce at `draft → registration_open` | Verified the only path ⇒ every Browse row has a location |
| D3 | Shared, ownerless, address-keyed, immutable venues | Provider place id = identity ⇒ no owner/moderation needed |
| D4 | One input box; precision derived from provider type | Regions same table; provider bbox = extent |
| D5 | AWS Location `geo-places`, adapter + mock | Google's 30-day lat/lng cap disqualifies a durable table |
| D6 | Completes PERSONALIZATION P1c venue tz | tz arrives free in the `Stored` call |
| D7 | Proxy all provider calls through the API | ⚠ register the `/geo/*` CloudFront behavior |
| D8 | Player position coarsened to ~1.1 km, never stored | Optional coarse home area in `player_settings` |
| D9 | Opt-in "Near me" **sort**, not a filter | Empty-catalog launch state decides it |
| D10 | SQL haversine + bbox, zero extensions | PostGIS only if regions ever need polygons |
| D11 | ⚖ One location per tournament; region covers multi-site | Deletes the join table; matches have no dates anyway |
| D12 | Fix `findNearby` in place; leave `courts` alone | 49 existing tests stay green; no floor change |
| D13 | New `location-discovery.spec.ts` + extend browse | `GEOCODER=mock`, deterministic fixtures |
| D14 | Group default seeds the session; **any member** may edit it; change posts to group chat | Poll auto-launch is a worker — nobody to type one. Needs its own player-authed route: `PATCH /:id` is organizer+creator-only |
| D15 | @coach: location field on the launch sheet + `propose_location_change` card. **Addressed-only, card-gated** | Registry wall intact; no ambient chat reading (breaches all 3 assistant principles). Authority = membership, unlike `propose_casual_launch`'s poll-creator rule |

## 6. Follow-on / out of scope

- **POI naming smoke test** — the one unverified assumption (D5). Build-time gate.
- **Reconciliation:** `rac8-4s-HL.md` §9 gains the location attribute and the `/geo/*` mount; route
  protection is unchanged (`/browse` is already public). `docs/assistant-help.md` must be updated in
  the same change — user-visible behavior change, §9.
- **Browse-by-venue / venue pages** — enabled by the shared ownerless catalog (D3), not built. Would
  want a seeded `regions` reference table for exact county filtering rather than centroid+radius.
- **Per-match court assignment** — blocked on match scheduling, which doesn't exist (D11).
- **Group default venue** — a group that plays the same place weekly could pin one; not needed for v1.
- **@coach inferring moves from un-addressed chat** — declined in D15; needs its own grill covering
  privacy (reading all group messages), token cost, and false-positive card noise.
- **A managed group location shortlist** (`player_group_locations` + picker) — judged
  disproportionate in D14; revisit if groups visibly rotate between the same few places.
