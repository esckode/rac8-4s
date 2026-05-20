import { PlayerRepository } from '../db'
import type { EmailAdapter } from '../email-adapter'
import { getLogger } from '../logger'

const log = getLogger('email-processor')

interface EmailProcessorDeps {
  playerRepo: PlayerRepository
  emailAdapter?: EmailAdapter
}

function generateEmailContent(
  type: string,
  playerName: string,
  data: Record<string, unknown>
): { subject: string; body: string } {
  switch (type) {
    case 'registration_confirmation':
      return {
        subject: `Registration confirmed: ${data.tournamentName}`,
        body: `Hi ${playerName}, your registration for ${data.tournamentName} is confirmed.`,
      }
    case 'partner_confirmation':
      return {
        subject: `Partner request for ${data.tournamentName}`,
        body: `Hi ${playerName}, confirm your partnership: ${data.confirmationLink}`,
      }
    case 'score_reminder':
      return {
        subject: `Score reminder: ${data.matchDescription}`,
        body: `Hi ${playerName}, please submit your score. Deadline: ${data.deadline}`,
      }
    case 'bracket_published':
      return {
        subject: `Bracket published: ${data.tournamentName}`,
        body: `Hi ${playerName}, the bracket for ${data.tournamentName} has been published.`,
      }
    case 'tournament_results':
      return {
        subject: `Tournament results: ${data.tournamentName}`,
        body: `Hi ${playerName}, ${data.tournamentName} concluded. Winner: ${data.winner}`,
      }
    default:
      throw new Error(`Unknown email type: ${type}`)
  }
}

export async function processEmailSend(
  payload: { type: string; recipientIds: string[]; data: Record<string, unknown> },
  deps: EmailProcessorDeps
): Promise<{ sent: number; skipped: number }> {
  const { type, recipientIds, data } = payload
  const tournamentId = data.tournamentId as string | undefined
  let sent = 0
  let skipped = 0

  const distinctIds = Array.from(new Set(recipientIds))
  const duplicates = recipientIds.length - distinctIds.length

  try {
    for (const recipientId of distinctIds) {
      const player = await deps.playerRepo.findById(recipientId)
      if (!player) {
        log.warn('email.recipient.not_found', { recipientId, ...(tournamentId && { tournamentId }) })
        skipped++
        continue
      }

      const { subject, body } = generateEmailContent(type, player.name, data)

      if (deps.emailAdapter) {
        await deps.emailAdapter.send(player.email, subject, body)
      }

      sent++
    }

    log.info('email.sent', { type, sent, skipped, ...(duplicates > 0 && { duplicates }), ...(tournamentId && { tournamentId }) })
    return { sent, skipped }
  } catch (error) {
    log.error('email.send.failed', {
      type,
      message: error instanceof Error ? error.message : String(error),
      ...(tournamentId && { tournamentId }),
    })
    throw error
  }
}
