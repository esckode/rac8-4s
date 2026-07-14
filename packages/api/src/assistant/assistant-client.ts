/**
 * AssistantClient — the LLM adapter seam (mirrors the email service's
 * mock/real adapter split so unit and e2e tests never hit the network).
 *
 * Real client: Claude via Claude Platform on AWS (design Q17 — Anthropic-
 * operated, SigV4/IAM, price parity) using the SDK beta tool runner, with the
 * first-party API as the documented fallback. Rules baked in by the design
 * (do not change): no `thinking` parameter, max_tokens 150 (safety ceiling —
 * the prompt does the shaping, Q16), max_iterations 5 (Q10 loop guard),
 * model from config (Q8: upgrade = config change).
 */
import { betaZodTool } from '@anthropic-ai/sdk/helpers/beta/zod'
import { z } from 'zod'
import {
  type AssistantToolContext,
  getMyMatches,
  getStandings,
  getBracket,
  getTournament,
  getGroupAvailability,
} from './tools'
import { proposeScore } from './propose-score'
import { proposePoll } from './propose-poll'
import { proposePollVote } from './propose-poll-vote'
import { proposeCasualLaunch } from './propose-casual-launch'
import { PollRepository } from '../repositories/poll-repository'

export interface AssistantTurnInput {
  systemPrompt: string
  /** Recent chat + asker identity + the question — the volatile per-turn part. */
  contextBlock: string
  /** The triggering message body (lets the mock route deterministically). */
  question: string
  /** Tools execute as the asking player through this context. */
  toolContext: AssistantToolContext
  /** Browser IANA timezone (B-Q6) — already folded into contextBlock; kept
   *  structural here so tools/tests can rely on it without re-parsing text. */
  askerTimezone?: string
  /** ISO-UTC turn timestamp — same rationale as askerTimezone. */
  currentDateTime?: string
}

export interface AssistantTurnResult {
  text: string
  usage: { inputTokens: number; outputTokens: number; cacheReadInputTokens: number }
  toolRounds: number
}

export interface AssistantClient {
  runTurn(input: AssistantTurnInput): Promise<AssistantTurnResult>
}

/**
 * Build the tool registry bound to one turn's context. Phase A's read tools
 * (get_*) plus Phase B's propose_* tools — the registry wall still holds:
 * propose_score never mutates a match, it only drafts a card (B0/B-Q7).
 * Real mutation happens exclusively via the confirm route calling the same
 * service the HTTP route uses (score-service.ts).
 */
function buildTools(ctx: AssistantToolContext, onToolRun: () => void) {
  return [
    betaZodTool({
      name: 'get_my_matches',
      description:
        "List the asking player's matches. Call this when the player asks about their next match, opponents, or schedule.",
      inputSchema: z.object({ tournamentId: z.string().optional() }),
      run: async (input: { tournamentId?: string }) => {
        onToolRun()
        return JSON.stringify(await getMyMatches(ctx, input))
      },
    }),
    betaZodTool({
      name: 'get_standings',
      description:
        'Get the standings of a tournament, including a rankReason explaining each row. Call this for questions about rankings or why someone is placed where they are.',
      inputSchema: z.object({ tournamentId: z.string() }),
      run: async (input: { tournamentId: string }) => {
        onToolRun()
        return JSON.stringify(await getStandings(ctx, input))
      },
    }),
    betaZodTool({
      name: 'get_bracket',
      description: 'Get the knockout bracket of a tournament.',
      inputSchema: z.object({ tournamentId: z.string() }),
      run: async (input: { tournamentId: string }) => {
        onToolRun()
        return JSON.stringify(await getBracket(ctx, input))
      },
    }),
    betaZodTool({
      name: 'get_tournament',
      description:
        'Get tournament details: status, deadlines, format, mode. Call this for questions about deadlines or tournament state.',
      inputSchema: z.object({ tournamentId: z.string() }),
      run: async (input: { tournamentId: string }) => {
        onToolRun()
        return JSON.stringify(await getTournament(ctx, input))
      },
    }),
    betaZodTool({
      name: 'get_group_availability',
      description:
        "Get how many of this group's members are free per weekday/day-part (morning/afternoon/evening). Call this when asked things like \"when can we play\" or \"what's a good time for everyone\". Returns COUNTS ONLY — never repeat or imply which specific member is free at a slot, even if asked; suggest times by citing counts (e.g. \"4 of 6 free Saturday evening\").",
      inputSchema: z.object({}),
      run: async () => {
        onToolRun()
        return JSON.stringify(await getGroupAvailability(ctx))
      },
    }),
    betaZodTool({
      name: 'propose_score',
      description:
        "Draft a score confirmation card for one of the asking player's own pending matches. Call this when the player reports a result in chat (e.g. \"I beat Bob 6-4, 6-3\"). Give the score asker-relative (the asker's numbers first in every set) — this tool normalizes it. Never claim the score was recorded: only a card was drafted, which the player must confirm themselves.",
      inputSchema: z.object({
        opponentName: z.string(),
        score: z.string(),
        tournamentId: z.string().optional(),
      }),
      run: async (input: { opponentName: string; score: string; tournamentId?: string }) => {
        onToolRun()
        return JSON.stringify(await proposeScore(ctx, input))
      },
    }),
    betaZodTool({
      name: 'propose_poll',
      description:
        'Draft a poll confirmation card. Call this when the player asks to start a poll or gauge interest (e.g. "poll the group for Saturday"). If a time is mentioned, resolve it to an ISO-8601 UTC instant yourself using the asker\'s timezone and the current time given in your context — targetTime must already be in the future. Omit targetTime for an open-ended poll. If the player asks you to pick or suggest a time rather than naming one, call get_group_availability first and prefer a slot where more members are free. Never claim the poll was created: only a card was drafted, which the player must confirm themselves.',
      inputSchema: z.object({
        question: z.string(),
        targetTime: z.string().optional(),
        autoCloseAt: z.string().optional(),
        autoLaunch: z.boolean().optional(),
        minPlayers: z.number().optional(),
        launchMatchFormat: z.string().optional(),
      }),
      run: async (input: {
        question: string
        targetTime?: string
        autoCloseAt?: string
        autoLaunch?: boolean
        minPlayers?: number
        launchMatchFormat?: string
      }) => {
        onToolRun()
        return JSON.stringify(await proposePoll(ctx, input))
      },
    }),
    betaZodTool({
      name: 'propose_poll_vote',
      description:
        'Draft a vote confirmation card for an open poll in this group. Call this when the player tells you their vote in chat (e.g. "I\'m in for Saturday", "put me down as maybe"). Identify the poll by a fragment of its question text. Never claim the vote was recorded: only a card was drafted, which the player must confirm themselves.',
      inputSchema: z.object({
        pollQuestion: z.string(),
        choice: z.enum(['in', 'out', 'maybe']),
      }),
      run: async (input: { pollQuestion: string; choice: 'in' | 'out' | 'maybe' }) => {
        onToolRun()
        return JSON.stringify(await proposePollVote(ctx, input))
      },
    }),
    betaZodTool({
      name: 'propose_casual_launch',
      description:
        'Draft a tournament-launch card from a poll the player created. Call this when the poll creator asks to start/launch a tournament from a poll (e.g. "launch it", "start the tournament from Saturday\'s poll"). Only the poll\'s creator can launch it — anyone else asking should be politely declined. Identify the poll by a fragment of its question text. Never claim the tournament was launched: only a card was drafted, which the player must confirm themselves.',
      inputSchema: z.object({
        pollQuestion: z.string(),
        defaultFormat: z.enum(['singles', 'doubles']).optional(),
      }),
      run: async (input: { pollQuestion: string; defaultFormat?: 'singles' | 'doubles' }) => {
        onToolRun()
        return JSON.stringify(await proposeCasualLaunch(ctx, input))
      },
    }),
  ]
}

/**
 * Real client. adapter 'anthropic-aws' → Claude Platform on AWS via
 * @anthropic-ai/aws-sdk (needs AWS_REGION + ANTHROPIC_AWS_WORKSPACE_ID —
 * missing either throws at construction); adapter 'anthropic' → first-party
 * API via ANTHROPIC_API_KEY. After construction the surface is identical.
 */
export class AnthropicAssistantClient implements AssistantClient {
  // Both SDK clients expose the same beta.messages.toolRunner surface
  private client: { beta: { messages: { toolRunner: (opts: unknown) => PromiseLike<any> } } }
  private model: string

  constructor(config: { adapter: 'anthropic-aws' | 'anthropic'; model: string }) {
    this.model = config.model
    if (config.adapter === 'anthropic-aws') {
      // Lazy require so the mock path never loads AWS credential machinery
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const AnthropicAws = require('@anthropic-ai/aws-sdk').default
      this.client = new AnthropicAws()
    } else {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const Anthropic = require('@anthropic-ai/sdk').default
      this.client = new Anthropic()
    }
  }

  async runTurn(input: AssistantTurnInput): Promise<AssistantTurnResult> {
    let toolRounds = 0
    const runner = this.client.beta.messages.toolRunner({
      model: this.model,
      max_tokens: 150, // safety ceiling only — the prompt does the shaping (Q16)
      system: [{ type: 'text', text: input.systemPrompt, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: input.contextBlock }],
      tools: buildTools(input.toolContext, () => toolRounds++),
      max_iterations: 5, // Q10 loop guard
    })
    const final = await runner

    const text = (final.content as Array<{ type: string; text?: string }>)
      .filter(b => b.type === 'text')
      .map(b => b.text ?? '')
      .join('')
      .trim()

    return {
      text,
      usage: {
        inputTokens: final.usage?.input_tokens ?? 0,
        outputTokens: final.usage?.output_tokens ?? 0,
        cacheReadInputTokens: final.usage?.cache_read_input_tokens ?? 0,
      },
      toolRounds,
    }
  }
}

const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

/**
 * Deterministic keyword router for tests/e2e — fakes ONLY the NL→intent hop;
 * the tools it calls are the REAL assistant tools with real auth scoping, so
 * e2e exercises trigger → queue → tool auth → DB → SSE → render end-to-end.
 *
 * Routes:
 * - "change/submit/set ... score" → decline (mirrors the empty Phase A write registry)
 * - "beat <name> <score>" → real propose_score (B7 — the highest-repetition write flow)
 * - "launch ... session" → real propose_casual_launch, resolved against the group's most
 *   recently created poll (B7 — the second highest-repetition write flow; a real model would
 *   pick the poll from conversation context, which this deterministic router doesn't have)
 * - "show me tournament <id>" → ADVERSARIAL: really calls get_standings with
 *   that id, playing a maximally prompt-injected model (A0.2 scenario 10)
 * - "who am i playing" / "next match" → real get_my_matches
 * - "standings" → real get_standings on the first group-linked tournament
 * - "when can we play" / "good time for everyone" → real get_group_availability,
 *   citing only counts (P12 privacy wall)
 * - anything else → canned "[mock] Coach reply"
 */
export class MockAssistantClient implements AssistantClient {
  /** Last input captured for test assertions. */
  lastInput: AssistantTurnInput | null = null

  async runTurn(input: AssistantTurnInput): Promise<AssistantTurnResult> {
    this.lastInput = input
    const q = input.question
    const ctx = input.toolContext

    const result = await this.route(q, ctx)
    return {
      text: result.text,
      usage: { inputTokens: 0, outputTokens: 0, cacheReadInputTokens: 0 },
      toolRounds: result.toolRounds,
    }
  }

  private async route(q: string, ctx: AssistantToolContext): Promise<{ text: string; toolRounds: number }> {
    if (/\b(change|submit|set|fix|update)\b.*\bscore\b/i.test(q)) {
      return {
        text: "I can't change scores — I'm read-only. Submit scores from the match screen.",
        toolRounds: 0,
      }
    }

    // Name capture is lazy so multi-word names (e.g. "Test User") work — it
    // backtracks to the shortest prefix that leaves a valid score at the end.
    // eslint-disable-next-line security/detect-unsafe-regex -- bounded repetition, mirrors score-parser.ts's FORMAT_REGEX
    const scoreMatch = q.match(/\bbeat\s+(.+?)\s+(\d+-\d+(?:,\s*\d+-\d+)*)\s*$/i)
    if (scoreMatch) {
      const [, opponentName, score] = scoreMatch
      const result = await proposeScore(ctx, { opponentName, score })
      if (result.status === 'card_posted') {
        return { text: "I've drafted that for you to confirm.", toolRounds: 1 }
      }
      if (result.status === 'ambiguous') {
        const names = result.candidates.map(c => c.opponentName).join(' or ')
        return { text: `I found more than one match — did you mean ${names}?`, toolRounds: 1 }
      }
      return { text: result.message, toolRounds: 1 }
    }

    if (/\blaunch\b.*\bsession\b/i.test(q)) {
      const pollRepo = new PollRepository(ctx.db)
      const polls = await pollRepo.findPollsByGroup(ctx.groupId)
      if (polls.length === 0) {
        return { text: "I couldn't find a poll to launch from.", toolRounds: 0 }
      }
      const mostRecent = polls[0]
      const result = await proposeCasualLaunch(ctx, { pollQuestion: mostRecent.question })
      if (result.status === 'card_posted') {
        return { text: "I've drafted a tournament launch for you to confirm.", toolRounds: 1 }
      }
      if (result.status === 'ambiguous') {
        const questions = result.candidates.map(c => c.question).join(' or ')
        return { text: `I found more than one poll — did you mean ${questions}?`, toolRounds: 1 }
      }
      return { text: result.message, toolRounds: 1 }
    }

    const adversarial = q.match(/show me tournament ([\w-]+)/i)
    if (adversarial) {
      const res = await getStandings(ctx, { tournamentId: adversarial[1] })
      if ('error' in res) return { text: "I couldn't find that tournament.", toolRounds: 1 }
      return { text: formatStandings(res), toolRounds: 1 }
    }

    if (/who am i playing|next match/i.test(q)) {
      const res = await getMyMatches(ctx, {})
      if ('error' in res) return { text: "I couldn't find that tournament.", toolRounds: 1 }
      const next = res.matches.find(m => m.status === 'pending') ?? res.matches[0]
      if (!next) return { text: "I couldn't find any upcoming matches for you.", toolRounds: 1 }
      return { text: `Next: vs ${next.opponentName} (${next.tournamentName})`, toolRounds: 1 }
    }

    if (/standings/i.test(q)) {
      const tournamentId = ctx.groupLinkedTournamentIds[0]
      if (!tournamentId) return { text: "I couldn't find any tournaments for this group.", toolRounds: 0 }
      const res = await getStandings(ctx, { tournamentId })
      if ('error' in res) return { text: "I couldn't find that tournament.", toolRounds: 1 }
      return { text: formatStandings(res), toolRounds: 1 }
    }

    if (/when can we play|when.*(everyone|we all).*free|good time for everyone/i.test(q)) {
      const res = await getGroupAvailability(ctx)
      if (res.slots.length === 0) {
        return { text: "Nobody's set their availability yet.", toolRounds: 1 }
      }
      const best = res.slots.reduce((a, b) => (b.freeCount > a.freeCount ? b : a))
      return {
        text: `${best.freeCount} of ${res.totalMembers} free ${WEEKDAY_NAMES[best.weekday]} ${best.dayPart}.`,
        toolRounds: 1,
      }
    }

    return { text: '[mock] Coach reply', toolRounds: 0 }
  }
}

function formatStandings(res: {
  groups: Array<{ groupName: string; standings: Array<{ rank: number; name: string; rankReason?: string }> }>
}): string {
  const lines = res.groups.flatMap(g =>
    g.standings.map(s => `${s.rank}. ${s.name}${s.rankReason ? ` — ${s.rankReason}` : ''}`)
  )
  return lines.length > 0 ? lines.join('\n') : 'No standings yet.'
}
