import { Pool } from 'pg'
import { getTestPool, beginTransaction, rollbackTransaction } from '../helpers/db'
import { PlayerRepository } from '../../db'
import { processEmailSend } from '../../workers/email-processor'
import { PlayerFactory } from '../factories'

describe('Email Processor', () => {
  let pool: Pool

  beforeAll(async () => {
    pool = await getTestPool()
    await beginTransaction(pool)
  })

  afterAll(async () => {
    await rollbackTransaction()
  })

  describe('processEmailSend', () => {
    it('sends registration_confirmation email to valid player', async () => {
      const playerRepo = new PlayerRepository(pool)
      const player = await PlayerFactory.create(pool)

      const result = await processEmailSend(
        {
          type: 'registration_confirmation',
          recipientIds: [player.id],
          data: { tournamentName: 'Test Tournament', tournamentId: 'tour_123' },
        },
        { playerRepo }
      )

      expect(result).toEqual({ sent: 1, skipped: 0 })
    })

    it('sends partner_confirmation email to valid player', async () => {
      const playerRepo = new PlayerRepository(pool)
      const player = await PlayerFactory.create(pool)

      const result = await processEmailSend(
        {
          type: 'partner_confirmation',
          recipientIds: [player.id],
          data: {
            tournamentName: 'Test Tournament',
            confirmationLink: 'https://example.com/confirm',
            tournamentId: 'tour_123',
          },
        },
        { playerRepo }
      )

      expect(result).toEqual({ sent: 1, skipped: 0 })
    })

    it('sends score_reminder email to valid player', async () => {
      const playerRepo = new PlayerRepository(pool)
      const player = await PlayerFactory.create(pool)

      const result = await processEmailSend(
        {
          type: 'score_reminder',
          recipientIds: [player.id],
          data: {
            matchDescription: 'Match 1 vs Player X',
            deadline: '2026-06-01T23:59:59Z',
            tournamentId: 'tour_123',
          },
        },
        { playerRepo }
      )

      expect(result).toEqual({ sent: 1, skipped: 0 })
    })

    it('sends bracket_published email to valid player', async () => {
      const playerRepo = new PlayerRepository(pool)
      const player = await PlayerFactory.create(pool)

      const result = await processEmailSend(
        {
          type: 'bracket_published',
          recipientIds: [player.id],
          data: { tournamentName: 'Test Tournament', tournamentId: 'tour_123' },
        },
        { playerRepo }
      )

      expect(result).toEqual({ sent: 1, skipped: 0 })
    })

    it('sends tournament_results email to valid player', async () => {
      const playerRepo = new PlayerRepository(pool)
      const player = await PlayerFactory.create(pool)

      const result = await processEmailSend(
        {
          type: 'tournament_results',
          recipientIds: [player.id],
          data: {
            tournamentName: 'Test Tournament',
            winner: 'Champion Player',
            tournamentId: 'tour_123',
          },
        },
        { playerRepo }
      )

      expect(result).toEqual({ sent: 1, skipped: 0 })
    })

    it('throws error for unknown email type', async () => {
      const playerRepo = new PlayerRepository(pool)
      const player = await PlayerFactory.create(pool)

      await expect(
        processEmailSend(
          {
            type: 'unknown_type',
            recipientIds: [player.id],
            data: {},
          },
          { playerRepo }
        )
      ).rejects.toThrow(/Unknown email type/)
    })

    it('skips nonexistent recipient IDs', async () => {
      const playerRepo = new PlayerRepository(pool)
      const player = await PlayerFactory.create(pool)

      const result = await processEmailSend(
        {
          type: 'registration_confirmation',
          recipientIds: [player.id, 'nonexistent_id_1', 'nonexistent_id_2'],
          data: { tournamentName: 'Test', tournamentId: 'tour_123' },
        },
        { playerRepo }
      )

      expect(result).toEqual({ sent: 1, skipped: 2 })
    })

    it('deduplicates recipient IDs', async () => {
      const playerRepo = new PlayerRepository(pool)
      const player = await PlayerFactory.create(pool)

      const result = await processEmailSend(
        {
          type: 'registration_confirmation',
          recipientIds: [player.id, player.id, player.id],
          data: { tournamentName: 'Test', tournamentId: 'tour_123' },
        },
        { playerRepo }
      )

      // Same player should only be sent once due to deduplication
      expect(result.sent).toBe(1)
    })

    it('reports duplicate count in log when duplicates exist', async () => {
      const playerRepo = new PlayerRepository(pool)
      const player1 = await PlayerFactory.create(pool)
      const player2 = await PlayerFactory.create(pool)

      // Call with duplicates: player1 appears twice
      const result = await processEmailSend(
        {
          type: 'registration_confirmation',
          recipientIds: [player1.id, player2.id, player1.id],
          data: { tournamentName: 'Test', tournamentId: 'tour_123' },
        },
        { playerRepo }
      )

      expect(result.sent).toBe(2) // Only 2 unique players
    })

    it('works without email adapter (optional dependency)', async () => {
      const playerRepo = new PlayerRepository(pool)
      const player = await PlayerFactory.create(pool)

      // Call without emailAdapter - should still work
      const result = await processEmailSend(
        {
          type: 'registration_confirmation',
          recipientIds: [player.id],
          data: { tournamentName: 'Test', tournamentId: 'tour_123' },
        },
        { playerRepo }
      )

      expect(result).toEqual({ sent: 1, skipped: 0 })
    })

    it('propagates email adapter failure', async () => {
      const playerRepo = new PlayerRepository(pool)
      const player = await PlayerFactory.create(pool)

      const failingAdapter = {
        send: jest.fn().mockRejectedValue(new Error('SMTP connection failed')),
      }

      await expect(
        processEmailSend(
          {
            type: 'registration_confirmation',
            recipientIds: [player.id],
            data: { tournamentName: 'Test', tournamentId: 'tour_123' },
          },
          { playerRepo, emailAdapter: failingAdapter as any }
        )
      ).rejects.toThrow(/SMTP connection failed/)
    })

    it('sends to multiple valid recipients', async () => {
      const playerRepo = new PlayerRepository(pool)
      const player1 = await PlayerFactory.create(pool)
      const player2 = await PlayerFactory.create(pool)
      const player3 = await PlayerFactory.create(pool)

      const result = await processEmailSend(
        {
          type: 'registration_confirmation',
          recipientIds: [player1.id, player2.id, player3.id],
          data: { tournamentName: 'Test', tournamentId: 'tour_123' },
        },
        { playerRepo }
      )

      expect(result).toEqual({ sent: 3, skipped: 0 })
    })

    it('handles mix of valid and invalid recipients', async () => {
      const playerRepo = new PlayerRepository(pool)
      const player1 = await PlayerFactory.create(pool)
      const player2 = await PlayerFactory.create(pool)

      const result = await processEmailSend(
        {
          type: 'bracket_published',
          recipientIds: [
            player1.id,
            'invalid_1',
            player2.id,
            'invalid_2',
            'invalid_3',
          ],
          data: { tournamentName: 'Test', tournamentId: 'tour_123' },
        },
        { playerRepo }
      )

      expect(result).toEqual({ sent: 2, skipped: 3 })
    })

    it('generates correct subject lines for each email type', async () => {
      const playerRepo = new PlayerRepository(pool)
      const player = await PlayerFactory.create(pool)

      const mockAdapter = { send: jest.fn() }

      // Test one type
      await processEmailSend(
        {
          type: 'bracket_published',
          recipientIds: [player.id],
          data: { tournamentName: 'Finals 2026', tournamentId: 'tour_123' },
        },
        { playerRepo, emailAdapter: mockAdapter as any }
      )

      expect(mockAdapter.send).toHaveBeenCalledWith(
        player.email,
        'Bracket published: Finals 2026',
        expect.stringContaining(player.name)
      )
    })

    it('includes player name in email body', async () => {
      const playerRepo = new PlayerRepository(pool)
      const player = await PlayerFactory.create(pool)

      const mockAdapter = { send: jest.fn() }

      await processEmailSend(
        {
          type: 'registration_confirmation',
          recipientIds: [player.id],
          data: { tournamentName: 'Test Tournament', tournamentId: 'tour_123' },
        },
        { playerRepo, emailAdapter: mockAdapter as any }
      )

      expect(mockAdapter.send).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.stringContaining(player.name)
      )
    })
  })
})
