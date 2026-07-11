# LLM Assistant (@coach) — Vendor & Model Cost Breakdown

> 🗂️ Supporting analysis for [LLM_ASSISTANT_DESIGN.md](./LLM_ASSISTANT_DESIGN.md) (Q8 model choice;
> **Q17 resolved 2026-07-11: Claude Platform on AWS** — this doc is the analysis behind it) and
> [LLM_ASSISTANT_IMPLEMENTATION.md](./LLM_ASSISTANT_IMPLEMENTATION.md).

**Date compiled:** 2026-07-11
**⚠️ Freshness caveat:** Anthropic first-party prices come from Anthropic's own docs (cached
2026-06-24); competitor and Bedrock numbers come from public pricing pages and third-party
aggregators found 2026-07-11 (sources at bottom). LLM pricing changes frequently — **re-verify
against the official pricing pages before any contract or budget commitment.**

---

## 1. Workload model (what a "turn" costs are computed from)

One assistant turn (Tier 1 Q&A, per the design):

| Component | Tokens | Notes |
|---|---|---|
| Input: system prompt + tools + help corpus | ~2,000 | Static — cacheable prefix |
| Input: chat window (~20 msgs) + question + tool results | ~1,000 | Volatile per turn |
| **Input total** | **~3,000** | |
| **Output** (terse tiered 20/50-word replies, `max_tokens` 150) | **~300** | Includes tool-call overhead across ≤5 rounds |

**Per-turn cost formula:** `3,000/1M × input_rate + 300/1M × output_rate`.
Monthly volumes shown: 1K / 10K / 50K turns. (For scale: 10K turns/month ≈ 27 groups asking 12
questions a day, every day — well beyond MVP expectations. Q10 rate limits cap a single group at
30/hr.)

---

## 2. Claude channels — same token prices, different plumbing

**Headline: per-token rates for the same Claude model are identical across all three channels.**
The choice is billing/ops, not price.

| | Claude API (first-party) | Claude Platform on AWS | Amazon Bedrock |
|---|---|---|---|
| Haiku 4.5 rate ($/MTok in/out) | $1.00 / $5.00 | $1.00 / $5.00 (docs: "pricing is the same as the Claude API") | $1.00 / $5.00 **global endpoint**; **regional endpoint +10%** → $1.10 / $5.50 |
| Prompt caching | write 1.25×, read 0.1× | same | same rates; manual `cache_control` only (no automatic top-level caching) |
| Batch API | 50% off | 50% off | 50% off ($0.50/$2.50 Haiku) — n/a for a chat bot |
| Billing mechanics | Anthropic invoice / prepaid credits | Metered in CCUs @ fixed $0.01/CCU, **arrears on the monthly AWS bill** (AWS Marketplace); no prepay/commitment | Standard AWS bill |
| Auth | `ANTHROPIC_API_KEY` secret | AWS SigV4 + IAM (no API key) | AWS IAM |
| Operated by | Anthropic | Anthropic (same-day feature parity) | AWS (feature subset, release lag; `anthropic.`-prefixed model IDs) |
| Cost verdict | baseline | **identical** | identical **if global endpoint**; +10% if regional pinning needed |

## 3. Claude model family (first-party rates, cached 2026-06-24)

| Model | $/MTok in | $/MTok out | Per turn | 1K/mo | 10K/mo | 50K/mo |
|---|---|---|---|---|---|---|
| **Haiku 4.5** (chosen — Q8) | $1.00 | $5.00 | $0.0045 | **$4.50** | **$45** | **$225** |
| Haiku 4.5 **with warm cache** (2K prefix @0.1×) | eff. ~$0.40 | $5.00 | $0.0027 | $2.70 | $27 | $135 |
| Sonnet 5 (intro to 2026-08-31) | $2.00 | $10.00 | $0.0090 | $9.00 | $90 | $450 |
| Sonnet 5 (standard) | $3.00 | $15.00 | $0.0135 | $13.50 | $135 | $675 |
| Opus 4.8 | $5.00 | $25.00 | $0.0225 | $22.50 | $225 | $1,125 |
| Fable 5 (reference only — not this workload's tier) | $10.00 | $50.00 | $0.0450 | $45.00 | $450 | $2,250 |

Upgrade math (Q8 "upgrade on evidence"): Haiku → Sonnet ≈ 3× spend; Haiku → Opus ≈ 5×. At MVP
volume even Opus is ~$22/month — the upgrade lever stays cheap until volume is large.

## 4. OpenAI (July 2026, aggregator-sourced)

| Model | $/MTok in | $/MTok out | Per turn | 1K/mo | 10K/mo | 50K/mo |
|---|---|---|---|---|---|---|
| GPT-5.4 mini (Haiku-class) | $0.75 | $4.50 | $0.0036 | $3.60 | $36 | $180 |
| GPT-5.4 nano (below Haiku class) | $0.20 | $1.25 | $0.0010 | $0.98 | $9.75 | $49 |
| GPT-4o mini (legacy) | $0.15 | $0.60 | $0.0006 | $0.63 | $6.30 | $32 |
| GPT-4.1 nano (legacy, cheapest) | $0.10 | $0.40 | $0.0004 | $0.42 | $4.20 | $21 |
| GPT-5.6 flagship tiers (Sol/Terra/Luna) | $5.00 / $2.50 / $1.00 | *(output rates not captured)* | — | — | — | — |

Prompt caching: cached input ~50% off on some models (e.g. 4o-mini $0.075/M cached) — weaker
discount than Anthropic/Google's 0.1×.

## 5. Google Gemini (July 2026, aggregator-sourced)

| Model | $/MTok in | $/MTok out | Per turn | 1K/mo | 10K/mo | 50K/mo |
|---|---|---|---|---|---|---|
| Gemini 3.5 Flash | $1.50 | $9.00 | $0.0072 | $7.20 | $72 | $360 |
| Gemini 3 Flash preview | $0.50 | *(output not captured)* | — | — | — | — |
| Gemini 2.5 Flash | $0.30 | $2.50 | $0.0017 | $1.65 | $16.50 | $83 |
| Gemini 2.5 Flash-Lite (cheapest) | $0.10 | $0.40 | $0.0004 | $0.42 | $4.20 | $21 |

Context caching: reads at 10% of input price (same ratio as Anthropic). Batch: 50% off.

## 6. Cross-vendor summary at our workload

Class-comparable models (small/fast tier suited to tool-calling chat):

| Rank by cost @10K turns/mo | Model | $/mo | Class vs Haiku 4.5 |
|---|---|---|---|
| 1 | GPT-4.1 nano / Gemini 2.5 Flash-Lite | ~$4 | Below — budget tier |
| 2 | GPT-4o mini | ~$6 | Below |
| 3 | GPT-5.4 nano | ~$10 | Below |
| 4 | Gemini 2.5 Flash | ~$17 | At/below |
| 5 | **Claude Haiku 4.5 (chosen)** | **~$45 ($27 cached)** | baseline |
| 6 | GPT-5.4 mini | ~$36 | Comparable |
| 7 | Gemini 3.5 Flash | ~$72 | Comparable/above |

**Reading:** within the *comparable* class (Haiku 4.5, GPT-5.4 mini, Gemini 3.5 Flash), Haiku sits
in the middle and the total spread is **~$36–72/month at 10× MVP volume** — i.e. cost cannot be the
deciding factor. The genuinely cheaper options (nano/Flash-Lite tiers) are a *capability class
below*, re-opening the Q8 quality concerns (tiebreaker explanations, injection resistance) that
Haiku only clears with the `rank_reason` mitigation.

## 7. Non-price factors (why cost isn't the decision)

- **Switching cost:** the implementation plan is specced on the Anthropic TS SDK (tool runner,
  strict Zod tools, cache breakpoints). Vendor switch = rewrite `AnthropicAssistantClient` (one
  file, by design) **plus** re-tune prompts/tool descriptions and re-validate behavior — real work
  to save single-digit dollars/month.
- **Upgrade path (Q8):** Haiku → Sonnet → Opus as a one-env-var quality upgrade exists only within
  one vendor's family.
- **AWS alignment without leaving Claude:** Claude Platform on AWS provides AWS-bill + IAM at
  identical prices — so "we run on AWS" is not an argument for switching vendors, only for
  (eventually) switching channels.
- **Quality is unpriced here:** the tables price tokens, not correctness. A wrong standings answer
  costs trust and support time worth more than the monthly bill.

## Sources

Anthropic first-party rates: claude-api reference (cached 2026-06-24) and
[Claude Platform pricing docs](https://platform.claude.com/docs/en/about-claude/pricing).
Claude Platform on AWS billing (CCU, arrears, price parity):
[AWS docs — Billing](https://docs.aws.amazon.com/claude-platform/latest/userguide/billing.html),
[AWS blog — Introducing Claude Platform on AWS](https://aws.amazon.com/blogs/machine-learning/introducing-claude-platform-on-aws-anthropics-native-platform-through-your-aws-account/),
[aws.amazon.com/claude-platform](https://aws.amazon.com/claude-platform/).
Bedrock Haiku 4.5 + regional premium + batch:
[Amazon Bedrock pricing](https://aws.amazon.com/bedrock/pricing/),
[pricepertoken — Claude Haiku 4.5](https://pricepertoken.com/pricing-page/model/anthropic-claude-haiku-4.5),
[cloudzero — Claude on AWS](https://www.cloudzero.com/blog/claude-on-aws-bedrock/).
OpenAI: [developers.openai.com pricing](https://developers.openai.com/api/docs/pricing),
[pricepertoken — OpenAI](https://pricepertoken.com/pricing-page/provider/openai),
[aipricing.guru](https://www.aipricing.guru/openai-pricing/),
[cloudzero — OpenAI pricing](https://www.cloudzero.com/blog/openai-pricing/).
Google: [ai.google.dev pricing](https://ai.google.dev/gemini-api/docs/pricing),
[tldl.io — Gemini pricing](https://www.tldl.io/resources/google-gemini-api-pricing),
[pricepertoken — Google](https://pricepertoken.com/pricing-page/provider/google).
