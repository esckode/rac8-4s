/**
 * CoachClient — the 1:1 Coach LLM adapter seam (mirrors AssistantClient's mock/real
 * split, assistant-client.ts). New vs. the group surface (COACH_1TO1_DESIGN.md §7 #3):
 * model from `config.coachModel` (separate from ASSISTANT_MODEL), max_tokens 500,
 * real conversation history with TWO cache_control breakpoints instead of one flattened
 * contextBlock string (cost lever 1 — COACH_1TO1_IMPLEMENTATION.md §0.5), and a
 * narrower tool registry (read tools + propose_remember only — no write-action tools).
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
import { proposeRemember } from './propose-remember'
import type { AssistantTurnResult } from './assistant-client'
import { COACH_MEDICAL_DECLINE_MESSAGE } from './coach-prompt'

export type CoachMessageRole = 'user' | 'assistant'

export interface CoachHistoryRow {
  role: CoachMessageRole
  content: string
}

export interface CoachTurnInput {
  systemPrompt: string
  /** Last ≤50 thread rows (S5's COACH_HISTORY_WINDOW), oldest first. */
  history: CoachHistoryRow[]
  /** Player snapshot + age-annotated memories + current datetime + asker timezone — volatile, never cached. */
  volatileBlock: string
  /** The triggering message body. */
  newMessage: string
  toolContext: AssistantToolContext
  /** player_settings.coach_memory_enabled — gates propose_remember's presence in the tool registry. Defaults true. */
  memoryEnabled?: boolean
}

export interface CoachClient {
  runCoachTurn(input: CoachTurnInput): Promise<AssistantTurnResult>
}

type ContentBlock = { type: 'text'; text: string; cache_control?: { type: 'ephemeral' } }
export interface CoachMessage {
  role: CoachMessageRole
  content: string | ContentBlock[]
}

/**
 * Pure message-shape composer (the cache-hit invariant lives here): merges
 * consecutive same-role history rows (the API rejects non-alternating roles),
 * puts the ephemeral cache_control breakpoint on the LAST history row only,
 * and appends the final volatile user message (snapshot+memories+body) with
 * no cache_control — it must never be cached, it's different every turn.
 */
export function buildCoachMessages(
  history: CoachHistoryRow[],
  volatileBlock: string,
  newMessage: string
): CoachMessage[] {
  const merged: CoachHistoryRow[] = []
  for (const row of history) {
    const last = merged[merged.length - 1]
    if (last && last.role === row.role) {
      last.content = `${last.content}\n${row.content}`
    } else {
      merged.push({ role: row.role, content: row.content })
    }
  }

  const messages: CoachMessage[] = merged.map(m => ({ role: m.role, content: m.content }))

  if (messages.length > 0) {
    const lastIdx = messages.length - 1
    const lastMsg = messages[lastIdx]
    messages[lastIdx] = {
      role: lastMsg.role,
      content: [{ type: 'text', text: lastMsg.content as string, cache_control: { type: 'ephemeral' } }],
    }
  }

  messages.push({ role: 'user', content: `${volatileBlock}\n\n${newMessage}` })

  return messages
}

/** The 1:1 registry wall: read tools + propose_remember only — no propose_score/poll/pollVote/casualLaunch. */
function buildCoachTools(ctx: AssistantToolContext, onToolRun: () => void, memoryEnabled: boolean) {
  const readTools = [
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
        'Get the standings of a tournament, including a rankReason explaining each row. Call this for questions about rankings, records, or why someone is placed where they are — including scouting an opponent.',
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
        "Get how many members of one of the player's groups are free per weekday/day-part. The player may be in several groups — pass the id of the one they mean. Returns COUNTS ONLY — never repeat or imply which specific member is free at a slot.",
      inputSchema: z.object({ groupId: z.string() }),
      run: async (input: { groupId: string }) => {
        onToolRun()
        return JSON.stringify(await getGroupAvailability(ctx, input))
      },
    }),
  ]

  if (!memoryEnabled) return readTools

  return [
    ...readTools,
    betaZodTool({
      name: 'propose_remember',
      description:
        'Offer to remember a stable, player-STATED fact about themselves (preference, equipment, self-declared goal, logistics) — never your own inference about their skill or behavior. Drafts a card the player must confirm; never claim it is remembered before that.',
      inputSchema: z.object({ text: z.string() }),
      run: async (input: { text: string }) => {
        onToolRun()
        return JSON.stringify(await proposeRemember(ctx, input))
      },
    }),
  ]
}

/**
 * Real client. Same adapter selection as AnthropicAssistantClient (AWS primary,
 * first-party fallback) — only the model, max_tokens, message shape, and tool
 * registry differ for the 1:1 surface.
 */
export class AnthropicCoachClient implements CoachClient {
  private client: { beta: { messages: { toolRunner: (opts: unknown) => PromiseLike<any> } } }
  private model: string

  constructor(config: { adapter: 'anthropic-aws' | 'anthropic'; model: string }) {
    this.model = config.model
    if (config.adapter === 'anthropic-aws') {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const AnthropicAws = require('@anthropic-ai/aws-sdk').default
      this.client = new AnthropicAws()
    } else {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const Anthropic = require('@anthropic-ai/sdk').default
      this.client = new Anthropic()
    }
  }

  async runCoachTurn(input: CoachTurnInput): Promise<AssistantTurnResult> {
    let toolRounds = 0
    const runner = this.client.beta.messages.toolRunner({
      model: this.model,
      max_tokens: 500,
      system: [{ type: 'text', text: input.systemPrompt, cache_control: { type: 'ephemeral' } }],
      messages: buildCoachMessages(input.history, input.volatileBlock, input.newMessage),
      tools: buildCoachTools(input.toolContext, () => toolRounds++, input.memoryEnabled ?? true),
      max_iterations: 5,
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
 * Deterministic keyword router for tests/e2e (§0.8) — fakes ONLY the NL→intent
 * hop; the tools it calls are the REAL coach tools with real player-level scoping.
 */
export class MockCoachClient implements CoachClient {
  lastInput: CoachTurnInput | null = null

  async runCoachTurn(input: CoachTurnInput): Promise<AssistantTurnResult> {
    this.lastInput = input
    const result = await this.route(input.newMessage, input.toolContext, input.memoryEnabled ?? true)
    return {
      text: result.text,
      usage: { inputTokens: 0, outputTokens: 0, cacheReadInputTokens: 0 },
      toolRounds: result.toolRounds,
    }
  }

  private async route(
    q: string,
    ctx: AssistantToolContext,
    memoryEnabled: boolean
  ): Promise<{ text: string; toolRounds: number }> {
    if (/\b(my|i've got|i have)\b.*\b(pain|injur|hurt|sore|ache|sprain|strain)\w*/i.test(q) || /\bhurts?\b/i.test(q)) {
      return { text: COACH_MEDICAL_DECLINE_MESSAGE, toolRounds: 0 }
    }

    if (/\bremember\b/i.test(q)) {
      if (!memoryEnabled) {
        return { text: "Memory is turned off in your profile, so I can't remember that.", toolRounds: 0 }
      }
      // eslint-disable-next-line security/detect-unsafe-regex -- bounded repetition, mirrors assistant-client.ts's score regex
      const text = q.replace(/^.*\bremember\b\s*(that\s+)?/i, '').trim()
      const result = await proposeRemember(ctx, { text })
      if ((result as { status: string; message?: string }).status === 'card_posted') {
        return { text: "I've drafted that for you to confirm.", toolRounds: 1 }
      }
      return { text: (result as { message?: string }).message ?? "I can't remember that right now.", toolRounds: 1 }
    }

    if (/\b(submit|change|set|fix|update)\b.*\bscore\b/i.test(q) || /\bbeat\s+.+\s+\d+-\d+/i.test(q)) {
      return { text: 'I can only draft score cards in your group chat.', toolRounds: 0 }
    }

    const adversarialMatch = q.match(/adversarial-tournament\s+(\S+)/i)
    if (adversarialMatch) {
      const result = await getTournament(ctx, { tournamentId: adversarialMatch[1] })
      return { text: JSON.stringify(result), toolRounds: 1 }
    }

    const scoutingMatch = q.match(/how do i beat\s+(.+?)\??\s*$/i)
    if (scoutingMatch) {
      const opponentName = scoutingMatch[1]
      const record = await findOpponentRecord(ctx, opponentName)
      return {
        text: `Scouting ${opponentName}: ${record}. Focus on consistency and cite your own recent form.`,
        toolRounds: 1,
      }
    }

    if (/\b(who am i playing|next match)\b/i.test(q)) {
      const result = await getMyMatches(ctx, {})
      const matches = 'matches' in result ? result.matches : []
      const next = matches.find(m => m.status !== 'completed')
      if (!next) return { text: 'No upcoming match scheduled.', toolRounds: 1 }
      return { text: `Next: vs ${next.opponentName} (${next.tournamentName})`, toolRounds: 1 }
    }

    if (/\bstandings\b/i.test(q)) {
      if (ctx.groupLinkedTournamentIds.length === 0) return { text: "I couldn't find standings.", toolRounds: 0 }
      const result = await getStandings(ctx, { tournamentId: ctx.groupLinkedTournamentIds[0] })
      if ('error' in result) return { text: "I couldn't find standings.", toolRounds: 1 }
      const row = result.groups.flatMap(g => g.standings)[0]
      return { text: row ? `Rank ${row.rank} — ${row.rankReason ?? ''}`.trim() : 'No standings yet.', toolRounds: 1 }
    }

    return { text: '[mock] Coach 1:1 reply', toolRounds: 0 }
  }
}

async function findOpponentRecord(ctx: AssistantToolContext, opponentName: string): Promise<string> {
  for (const tournamentId of ctx.groupLinkedTournamentIds) {
    const result = await getStandings(ctx, { tournamentId })
    if ('error' in result) continue
    for (const group of result.groups) {
      const row = group.standings.find(s => s.name === opponentName)
      if (row) return `${row.wins}-${row.losses}`
    }
  }
  return 'no record found'
}
