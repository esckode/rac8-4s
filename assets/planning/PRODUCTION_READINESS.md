# Production Readiness — open gaps before multi-instance prod

> 🗂️ Tracked in the [project backlog](../../BACKLOG.md).

**Date:** 2026-06-26
**Status:** 🔧 OPEN — cross-cutting items that must be resolved **before going multi-instance in production**.
Surfaced during the messaging V2 build ([`MESSAGING_IMPLEMENTATION_V2.md`](./MESSAGING_IMPLEMENTATION_V2.md))
but **not messaging-specific** — this is the home for them so they don't get lost in a feature plan.

These do **not** block the build (V1–V6 are complete and verified). They block a real multi-instance
**prod cutover**.

---

## Legend
| | Meaning |
|---|---|
| 🔴 | High — correctness/security impact in prod; do first |
| 🟠 | Medium — needed before relying on the path in prod |

---

## PR-1 — `trust proxy` behind the load balancer 🔴
**Scope:** platform-wide (not just messaging). **Found in:** V2.3.

The app does **not** call Express `app.set('trust proxy', …)`, so `req.ip` resolves to the **load
balancer's IP** for all proxied traffic (the nginx LB already forwards `X-Forwarded-For` / `X-Real-IP`).
Consequences in prod:
- **Rate-limit keys collapse** — keys built from `req.ip` (e.g. `login:<email>:<ip>`) share one IP value
  for everyone behind the LB, so per-client limiting is meaningless. *(The shared Redis counter from V2.3
  is itself correct — this is about the key, not the store.)*
- **IP-based logging / audit** records the LB IP, not the client.

**Fix:** set `trust proxy` (scoped to proxied / Redis-selected deploys) so `req.ip` reflects the real
client via `X-Forwarded-For`. Small, well-scoped, TDD-able. **Do this first.**

## PR-2 — SSE catch-up on reconnect 🟠
**Scope:** messaging. **Found in:** V2 design review (gap #3).

Redis pub/sub is **at-most-once** with no persistence. A client whose SSE connection drops and
**reconnects to a different instance** (deploy, scale-down, network blip) can **miss messages emitted
during the gap**. `reconnecting-eventsource` re-establishes the socket but does not replay the gap.

**Fix:** add `Last-Event-ID` / a backfill-on-reconnect (catch up missed messages from history by
last-seen id) before treating SSE as guaranteed delivery. Relevant once real multi-instance traffic flows.

## PR-3 — Production cutover 🟠
**Scope:** platform / infra. **Found in:** V2 design review (gap #4).

No task yet exists for the actual production rollout of the distributed topology:
- **Provisioning** — ElastiCache (multi-AZ — see the Redis-required failure model in the V2 plan), ASG,
  ALB target groups + the readiness/liveness probes built in V1.5.
- **Rolling-deploy mixed-mode** — during a deploy, some instances run the in-process bus and some the Redis
  bus; SSE fan-out splits across the two until all instances are on Redis. Needs a deploy strategy.
- **Live-session migration** — at cutover from `InMemoryTokenStore` → `RedisTokenStore`, in-flight
  magic-link sessions must not evaporate.

**Fix:** add a closing **prod-cutover phase** (likely touching `IaC-*.md`) covering provisioning, deploy
order, and session migration.

---

## Relationship to other docs
- Origin + per-item detail: [`MESSAGING_IMPLEMENTATION_V2.md`](./MESSAGING_IMPLEMENTATION_V2.md)
  "Production-readiness gaps" section (points here).
- PR-3 will touch the IaC docs (`IaC-architecture.md` / `IaC-design.md` / `IaC-implementation.md`).
