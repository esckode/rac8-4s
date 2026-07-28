# Tournament Location & Discovery — Design
## Where a tournament is, and "find tournaments near me"

> 🗂️ Tracked in the [project backlog](../../BACKLOG.md).

**Date:** 2026-07-25 — **grilled to resolution 2026-07-25, see §3 (D1–D15).**
**Amended 2026-07-26:** D16 added (the public-side write path + participant notification, the one gap
D1–D15 left on the main path); D1 gains a scope call removing the visibility control from v1.
**Grilled again 2026-07-26** on the four remaining gaps — resolved into D7 (`/geo/*` auth + limits),
D8 (home-area storage), §4 (schema + type widening) and new **D17** (browse contract). That grill
cascaded into two revisions: **D10** loses its bbox prefilter, and **D12** now leaves `findNearby`
untouched. No open questions remain; the only unverified item is D5's POI smoke test, which needs a
live key.
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

**Scope call (2026-07-26): v1 builds no visibility control.** Both crossing cases above are
currently *unreachable*, so nothing is at risk by leaving the axis fixed. Verified: `'unlisted'` is
written in exactly two production places, both group-launch — the manual launch
(`player-groups.ts:941`) and the auto-launch worker (`auto-close-processor.ts:98`); the only
"unlisted scheduled" tournament in the tree is a `/test/*` e2e seeder (`app.ts:313`). Everything
else takes the repo default `'public'` (`db.ts:234`), and `POST /tournaments` never accepts the
field.

Visibility is therefore determined entirely by **creation path** — organizer-created ⇒ `public`,
group-launched ⇒ `unlisted` — which is already the product rule. So `POST /tournaments` does *not*
need to accept `visibility`, create/edit does *not* need a control, and there is no post-publish
flip case to design (no route can change the column). The gate stays keyed to `visibility` because
that is the correct predicate and the column already exists; it simply has no UI.

*Consequence of the consequence:* because visibility is immutable, D16's "reject `location_id` on an
unlisted tournament" guard cannot be dodged by setting a venue and then flipping.

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

No credential ever reaches the browser; the instance-role chain is reused (SES precedent). The mock
adapter means unit and e2e tests need no network. Latency is one extra hop per keystroke, which a
300 ms debounce absorbs.

**Both routes are public** *(grilled 2026-07-26)* — D8's "Set your area" box lives on `/browse`,
which is unauthenticated, and strangers with no account are the audience this feature exists to
serve. So `/geo/resolve` is an anonymous endpoint that costs money per novel place and writes to a
shared table, and it is bounded on four levels:

| Level | Control |
|---|---|
| Client gates | `minLength: 3` (1–2 char prefixes return unusable predictions), 300 ms debounce, in-memory session cache (backspace-and-retype costs nothing), `AbortController` on each keystroke |
| Cache-first resolve | `SELECT … WHERE place_id = $1` **before** any provider call — a hit returns the row for free, so sustained cost tracks *novel* places, not traffic |
| Per-IP rate limits | `geoAutocompletePerIp: 60 / 15 min`, `geoResolvePerIp: 20 / 15 min`, both `countMode: 'all'`, keys `geo:ac:${req.ip}` / `geo:resolve:${req.ip}` |
| Config | `config.ts` `limits.rateLimit.*` with env overrides, mirroring `registerPerIp` |

The split matters: the existing limits are all 3–25 per 15 min, and autocomplete fires per
*keystroke*. Any of those numbers would break the typeahead on the first venue. The four client
gates put a realistic selection at ~2–4 calls.

⚠ **The autocomplete cache cannot live server-side.** D5 established that `Storage` is unsupported
on Autocomplete/Suggest — those results are `SingleUse`. Caching them in Redis or a table to serve
later requests would be storing SingleUse results, which is the same terms violation that
disqualified Google. An ephemeral in-memory cache scoped to one typing interaction is a different
thing and is fine.

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

A coarse **home area** — a city/region place reference, *never* precise coordinates — lets "Near me"
survive a denied permission prompt and persist across sessions. It is set through the same
autocomplete box. **Not optional:** D9's fallback chain and D13's e2e assertions both depend on it.

**Storage** *(grilled 2026-07-26)*: `player_settings.home_location_id` → `locations(id)`. The player
picks a city through D4's autocomplete, it resolves via `POST /geo/resolve` into the shared ownerless
table, and the player row holds nothing but a pointer. No coordinate ever lands on a player-owned
row, which makes "never stored" structurally true rather than merely intended.

⚠ **The precision guard is load-bearing, not cosmetic.** Without it a player can set their home
*club* — a ~10 m venue address — as their "area", reintroducing precise personal location through the
back door. Cross-table precision cannot be a `CHECK`, so `PATCH /api/auth/me/settings` enforces it:

```ts
if (!['city', 'region'].includes(loc.place_precision))
  return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'Home area must be a city or region' })
```

**Read precedence** (one storage mechanism, account wins when signed in):

```
1. navigator.geolocation      granted this session
2. home_location_id           if authed  ← account setting actually takes effect
3. localStorage['rac8.homeArea']   this device
4. prompt "Set your area"
```

Anonymous strangers get device persistence; signed-in players get a setting that follows them.
Putting `home_location_id` above localStorage avoids the trap where a /profile change is silently a
no-op on any device the player has already used.

⚠ **`logout` must clear the localStorage key.** It currently removes only `TOKEN_KEY` and the session
snapshot (`useAuth.tsx:335`) — no `localStorage.clear()` — so without this the previous user's area
carries to the next person on the same phone. Low severity (a city, not an address) but concrete:
this codebase already reasons about shared devices, e.g. the `registerPerIp` comment's "a captain may
register several people from one phone". Note `group-last-seen:*` already leaks this way today.

Nothing precise exists to erase on a DSR request, and `player_settings` already cascades on
`player_id`. A copy on the user's own device is not operator-controlled data. This satisfies the
"non-storage of precise location" constraint recorded in the backlog item.

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

### D10 — Plain SQL haversine as a pure `ORDER BY`. No prefilter, zero extensions

**Revised 2026-07-26.** This decision originally specified a bounding-box `WHERE` prefilter. D17
established that unlocated tournaments sort last rather than being removed, and that clause is wrong
twice over under that rule: it drops rows outside the radius (D9: *"distant tournaments sink but
remain"*), and `NULL` coordinates fail a `BETWEEN` outright, so every legacy row would be eliminated
by the very predicate meant to be an optimization. D10's own reasoning applies to it — a btree index
is "sufficient well past this project's scale", and a prefilter solves a scale problem that does not
exist. **Geography appears only in the `ORDER BY`.**

```sql
SELECT t.*, l.name, l.place_precision,
       CASE WHEN l.id IS NULL THEN NULL ELSE
         GREATEST(0,
           6371 * acos(LEAST(1, GREATEST(-1,
             sin(radians($lat)) * sin(radians(l.latitude)) +
             cos(radians($lat)) * cos(radians(l.latitude)) *
             cos(radians(l.longitude) - radians($lng))
           )))
           - COALESCE(l.extent_radius_km, 0)
         )
       END AS distance_km
FROM public.tournaments t
LEFT JOIN public.locations l ON l.id = t.location_id
WHERE <existing status / visibility / deleted_at clauses — unchanged>
ORDER BY distance_km ASC NULLS LAST
```

- **`LEFT JOIN`, not `JOIN`** — an inner join would silently delete every unlocated tournament,
  which is the D17 failure in a different disguise.
- **`NULLS LAST`** is Postgres's default on `ASC`; stated explicitly because the whole D17 guarantee
  rests on it.
- ⚠ **Clamp the `acos` argument.** Floating-point drift can push it just past ±1, and Postgres
  *throws* rather than returning NaN. The `LEAST/GREATEST` pair is not defensive noise.
- **Region extent is a distance correction, not a filter.** Subtracting `extent_radius_km` means
  standing inside Palm Beach County reads as distance 0 rather than distance-to-centroid, which is
  what lets region rows sort sensibly against venue rows. `GREATEST(0, …)` floors it.
- **Kilometres in SQL, miles at render** (D9) — one conversion, in the client.

Extensions were rejected on operational grounds, not technical ones: this project has **zero**
extensions today, and PostGIS or `cube`+`earthdistance` would have to be provisioned in four
environments. PostGIS remains the migration target *if* regions ever need real polygon containment
instead of centroid+radius.

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

- **`findNearby` is left untouched** *(revised 2026-07-26)*. This decision originally put it in scope
  as "the wrong-shaped predecessor of our query". D10 and D17 removed that relationship: the real
  query is a `LEFT JOIN` rooted in `tournaments` with no geographic `WHERE` clause, living in
  `TournamentRepository.listPublic`. `findNearby` is not its predecessor in any sense —

  | | `findNearby` | what "near me" needs |
  |---|---|---|
  | Returns | `LocationRow[]` — venues | tournaments |
  | Ordering | `ORDER BY created_at DESC` — **never computes a distance at all** | by distance |
  | Unlocated rows | structurally unreachable (no `locations` row to match) | must appear, sorted last |

  Editing it would therefore be the adjacent-code refactor §3 prohibits — no changed line would trace
  to the request, and its 49 tests and coverage contribution stay untouched. Its two defects are
  recorded here as dead-code debt: the missing `cos(lat)` longitude correction, and the
  `ORDER BY created_at` that makes its name a lie. Both are inert with zero callers. It becomes real
  work if §6's venue pages get built — *"what courts are near me"* is a genuine `locations` question.
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
- **EXTEND** for D16: the organizer venue-edit + announcement cases are listed in D16's own test bullet.
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

### D16 — The public write path: organizer-authed PATCH, and a change announces itself

D14 gave the unlisted side a complete write story. The public side had none: D7 resolves a place and
§4 adds `tournaments.location_id`, but nothing said which route attaches one to the other — and D2
deliberately lets an organizer create a draft *before* the venue is settled, which makes an edit path
mandatory rather than optional.

**No new route is needed.** `POST /tournaments` accepts an optional `locationId`; `PATCH
/tournaments/:id` (`routes/tournaments.ts:1663`) gains `locationId` and `locationText` alongside its
existing `name` / `maxPlayers` / `description` allowlist. This is the **mirror image of D14**: the two
guards that made `PATCH` unusable for a group session — `requireOrganizerAuth` (members hold player
tokens) and `assertOrganizerOwnsTournament(creator_id)` (only the creator passes) — are exactly what a
public tournament wants, because a public venue is the organizer's to declare and nobody else's.

The FE flow is D7's two calls plus a third: `GET /geo/autocomplete` → `POST /geo/resolve` (upserts the
shared `locations` row, returns it) → `PATCH /tournaments/:id {locationId}`. `location_id` is only ever
set by reference to an already-persisted row, so the FK is the whole of the validation.

⚠ **`locationId` on an `unlisted` tournament is a `400`.** D1's "never geocoded" is a privacy rule:
accepting a resolved id here would persist precise coordinates for what is frequently a residence.
Per D1's scope call the check is stable — visibility is immutable, so it cannot be dodged by setting
a venue and then flipping.

**A change to a *published* tournament announces itself:**

| Tournament state | On location change |
|---|---|
| `draft` | Silent — nobody is registered, there is nothing to announce |
| `registration_open` and beyond | Posts an **announcement** to the tournament conversation, which emails every registered player |

**It must be an `announcement`, not a `system` message** — the load-bearing detail, and the point
where D14's mechanism deliberately does *not* transfer. `group-notify-selector.ts` maps `system → no
notifications`. That silence is right for D14: eight people in a live group chat who will see the 📍
line anyway. It is wrong here, where the audience is strangers who registered weeks ago and are not
watching a feed. Announcements are push-eligible.

**No new machinery.** `POST /tournaments/:id/announcements` (`routes/messages.ts:35`) already performs
the entire fan-out: `messageRepo.sendBroadcast` computes recipients, then one `messaging.notify` job
per recipient (`routes/messages.ts:96`) hands off to `processMessagingNotify`, which coalesces N
unread into one email each and already respects P9 quiet hours. The location change calls that same
primitive with a generated body (`📍 Location changed to …`), mirroring D14's wording. No new job
type, no new email template, no new worker registration. (Note `sendBroadcast` takes `senderPlayerId:
payload.sub` — an organizer id in a player-named field. That is the existing route's behavior, not
something this decision introduces.)

**Only a real change fires it.** Compare resolved `location_id` / `location_text` before and after, so
a PATCH touching only `name` sends nothing. The existing `jobId: notify-${conversationId}-${recipientId}`
dedup (`routes/messages.ts:98`) already collapses an organizer fiddling with the venue several times
into one email per recipient.

**The confirmation email carries the location** — the fix at the source. `sendMagicLinkEmail`
(`email-adapter.ts:91`, subject *"You're registered for X"*) today contains the tournament name and a
magic link and nothing else, so a player registering for a public tournament is never told where it is
in the one artifact that actually reaches them. It gains a location line, rendered by `place_precision`
per D9's table.

*Rejected:* a dedicated `tournament.location_changed` job type + template — `messaging.notify` already
coalesces per recipient and honors quiet hours; a parallel path would have to re-earn both. An
organizer opt-out on the announcement — a venue move is precisely the thing a registrant must not
miss; if it proves noisy the fix is the change-detection above, not a switch.

*Test surface (extends D13):*
- **e2e** in `location-discovery.spec.ts`: organizer patches a published tournament's venue → a
  registered player sees the announcement; the same patch on a `draft` posts nothing; `locationId` on
  an unlisted tournament is rejected.
- **jest:** the PATCH allowlist additions, the unlisted-rejection guard, change-detection (no
  announcement when only `name` changes), and the location line in `sendMagicLinkEmail`.

### D17 — Browse contract: one method, two orderings; unlocated rows sink but never vanish

**Unlocated tournaments sort last — they are never filtered out.** §4's "no backfill" is deliberate,
but read with the original wording ("excluded from the distance sort") it recreated exactly the
failure D9 rejected a radius filter to avoid. The publish gate (D2) fires only on *future*
`draft → registration_open` transitions, so on day one **every** already-published tournament has
`location_id = NULL`. Excluding them means tapping "📍 Near me" at launch shows only tournaments
published after the feature shipped — possibly none, which reads as a broken app. Sorting them last
degrades gracefully and keeps the chip useful from the first deploy.

**One method, not two.** `listPublic` (`db.ts:291`) gains optional `lat` / `lng`. Because nothing is
filtered out, "Near me" returns the *same rows* as the default view — same `total`, same `hasMore`,
same population. It is not a different set of tournaments, only a different sequence, so a separate
`findNearbyTournaments` would be a second name for one query:

| | shared | differs |
|---|---|---|
| `publishedStatuses` (ISSUE-9), `visibility='public'`, `deleted_at`, optional `sport`, `registered_count` subquery (ISSUE-10), `COUNT(*)`, `LIMIT`/`OFFSET` | ✓ byte-identical | — |
| `LEFT JOIN locations`, `distance_km` in `SELECT`, `ORDER BY` | — | ✓ |

Duplicating four pieces of shared logic — with the ISSUE-9 status list the most likely to drift — to
avoid one optional parameter is the wrong trade. The chip toggles a query param, not an endpoint,
which also keeps both orderings on one cacheable URL shape.

**The client always passes explicit `lat`/`lng`; the server never infers from the session.** D8 wants
the response CDN-cacheable on a coarse grid, and a server-side "use this player's home area" lookup
makes every response user-specific and uncacheable. `home_location_id`'s coordinates ride along in
the settings payload and the client passes them like any other parameter. The server rounds
defensively to 2 dp — a client sending full precision would fragment the cache grid.

```
GET /tournaments/public?lat=26.37&lng=-80.13&offset=0&limit=10
```

Each row gains `location: { name, precision, distanceMi } | null`; the client applies D9's
precision table. `total` / `hasMore` are unaffected — only `ORDER BY` changes, the `WHERE` clause is
identical — so pagination stays stable across both sorts and the chip needs no page reset.

*The full chain:* `navigator.geolocation` → round to 2 dp (D8) → `GET /tournaments/public?lat=&lng=`
→ `listPublic({lat, lng, …})` → D10's query → `location` on each row → D9's render table.

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

-- the player's coarse home area — a pointer, never coordinates (D8)
ALTER TABLE public.player_settings
  ADD COLUMN home_location_id TEXT NULL REFERENCES public.locations(id);
-- precision is enforced in PATCH /api/auth/me/settings ('city'|'region' only):
-- a cross-table CHECK is not expressible, and without the guard a player can
-- store their home *club* — a ~10 m address — as their "area" (D8)

CREATE INDEX idx_locations_coords ON public.locations(latitude, longitude);
```

**`name` stays `NOT NULL`** — AWS `GetPlace` returns a `Title` defined for every place type (POI name
· formatted address · locality · admin area), so `name` means "the string you display" at all four
precisions and D9's render table needs no `COALESCE` branch. `address_label` holds the full formatted
address and merely duplicates `name` for `address`-precision rows, which is harmless.

⚠ **Widen the TypeScript types with the columns.** Dropping `NOT NULL` on `sport` / `total_courts` in
the DB while `LocationRow` (`db.ts:1433`) still types them `sport: string` / `total_courts: number`
would have every geocoded row carry `null` at runtime under a type asserting otherwise. So
`sport: string | null`, `total_courts: number | null`, and both optional on `CreateLocationInput`
(`db.ts:1619`). Blast radius is the test suite only — D12's zero production callers — and the 49
existing tests pass untouched because they always supply both. `findBySport` excluding geocoded rows
then falls out correctly: a geocoded county is not a tennis venue.

`public` ⇒ `location_id` required at publish (D2); `location_text` may carry extra detail.
`unlisted` ⇒ `location_id` NULL, `location_text` only.

**No backfill.** Existing rows get `location_id = NULL`. The publish gate only fires on *future*
`draft → registration_open` transitions, so already-published tournaments keep working; they render
"Location not specified" and **sort last** under "Near me" — never excluded (D17). `location_text` on an unlisted
tournament is free text that may reference a residence — it is never geocoded, and inherits
whatever DSR treatment the tournament row already has.

## 5. Decision summary

| # | Decision | Note |
|---|---|---|
| D1 | Gate on `visibility`, not `mode` | `public` ⇒ findable; `unlisted` ⇒ text, never geocoded. **v1 builds no visibility control** — creation path already determines it |
| D2 | Enforce at `draft → registration_open` | Verified the only path ⇒ every Browse row has a location |
| D3 | Shared, ownerless, address-keyed, immutable venues | Provider place id = identity ⇒ no owner/moderation needed |
| D4 | One input box; precision derived from provider type | Regions same table; provider bbox = extent |
| D5 | AWS Location `geo-places`, adapter + mock | Google's 30-day lat/lng cap disqualifies a durable table |
| D6 | Completes PERSONALIZATION P1c venue tz | tz arrives free in the `Stored` call |
| D7 | Proxy all provider calls through the API. **Both routes public**, split per-IP limits (60/20 per 15 min), cache-first resolve, 4 client gates | ⚠ register the `/geo/*` CloudFront behavior. ⚠ autocomplete responses are `SingleUse` — no server-side cache, ever |
| D8 | Player position coarsened to ~1.1 km, never stored. Home area = `home_location_id` FK + **city/region precision guard** | Guard is load-bearing (a home *club* is a 10 m address). Precedence: geo → account → localStorage → prompt. ⚠ `logout` must clear the local key |
| D9 | Opt-in "Near me" **sort**, not a filter | Empty-catalog launch state decides it |
| D10 | SQL haversine as a pure `ORDER BY`; **no bbox prefilter**; extent as a distance correction | Prefilter contradicted D17 twice over. ⚠ clamp the `acos` arg or Postgres throws |
| D11 | ⚖ One location per tournament; region covers multi-site | Deletes the join table; matches have no dates anyway |
| D12 | **Leave `findNearby` alone** (revised); leave `courts` alone | It returns venues and orders by `created_at` — not the predecessor of anything here. 49 tests stay green; two defects recorded as dead-code debt |
| D13 | New `location-discovery.spec.ts` + extend browse | `GEOCODER=mock`, deterministic fixtures |
| D14 | Group default seeds the session; **any member** may edit it; change posts to group chat | Poll auto-launch is a worker — nobody to type one. Needs its own player-authed route: `PATCH /:id` is organizer+creator-only |
| D15 | @coach: location field on the launch sheet + `propose_location_change` card. **Addressed-only, card-gated** | Registry wall intact; no ambient chat reading (breaches all 3 assistant principles). Authority = membership, unlike `propose_casual_launch`'s poll-creator rule |
| D16 | Public write path = `POST`/`PATCH /tournaments/:id` (no new route); a change on a published tournament posts an **announcement**; confirmation email carries the location | Mirror image of D14 — organizer+creator guards are correct here. `system` messages don't notify, announcements do. Reuses `sendBroadcast` + `messaging.notify` wholesale |
| D17 | Unlocated rows **sort last, never filtered**; `listPublic` gains optional `lat`/`lng` — one method, two orderings | Day one every published row is unlocated, so excluding them recreates D9's blank page. Same rows ⇒ same `total`/`hasMore` ⇒ a second method would only duplicate ISSUE-9/ISSUE-10 logic |

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
