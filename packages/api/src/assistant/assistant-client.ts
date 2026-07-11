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
} from './tools'

export interface AssistantTurnInput {
  systemPrompt: string
  /** Recent chat + asker identity + the question — the volatile per-turn part. */
  contextBlock: string
  /** The triggering message body (lets the mock route deterministically). */
  question: string
  /** Tools execute as the asking player through this context. */
  toolContext: AssistantToolContext
}

export interface AssistantTurnResult {
  text: string
  usage: { inputTokens: number; outputTokens: number; cacheReadInputTokens: number }
  toolRounds: number
}

export interface AssistantClient {
  runTurn(input: AssistantTurnInput): Promise<AssistantTurnResult>
}

/** Build the read-only Phase A tool registry bound to one turn's context. */
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

/**
 * Deterministic keyword router for tests/e2e — fakes ONLY the NL→intent hop;
 * the tools it calls are the REAL assistant tools with real auth scoping, so
 * e2e exercises trigger → queue → tool auth → DB → SSE → render end-to-end.
 *
 * Routes:
 * - "change/submit/set ... score" → decline (mirrors the empty Phase A write registry)
 * - "show me tournament <id>" → ADVERSARIAL: really calls get_standings with
 *   that id, playing a maximally prompt-injected model (A0.2 scenario 10)
 * - "who am i playing" / "next match" → real get_my_matches
 * - "standings" → real get_standings on the first group-linked tournament
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
