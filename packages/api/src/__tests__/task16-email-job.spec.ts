import { openDatabase, TournamentRepository, PlayerRepository } from '../db'
import { InMemoryEmailAdapter } from '../email-adapter'
import { InMemoryJobQueue } from '@worker/job-queue'
import { processEmailSend } from '../workers/email-processor'

describe('Task #16: Email Notification Job', () => {
  let db: any
  let tournamentRepo: TournamentRepository
  let playerRepo: PlayerRepository
  let emailAdapter: InMemoryEmailAdapter
  let jobQueue: InMemoryJobQueue

  let tournamentId: string
  let player1Id: string
  let player1Email: string
  let player2Id: string
  let player2Email: string
  let player3Id: string
  let player3Email: string
  let player4Id: string
  let player4Email: string

  beforeEach(() => {
    db = openDatabase(':memory:')
    tournamentRepo = new TournamentRepository(db)
    playerRepo = new PlayerRepository(db)
    emailAdapter = new InMemoryEmailAdapter()
    jobQueue = new InMemoryJobQueue()

    const now = new Date()
    const pastDeadline = new Date(now.getTime() - 86400000).toISOString()
    const futureDeadline = new Date(now.getTime() + 259200000).toISOString()

    const tournament = tournamentRepo.create({
      name: `Email Test ${Date.now()}`,
      sport: 'tennis',
      matchFormat: 'singles',
      maxPlayers: 4,
      registrationDeadline: pastDeadline,
      groupStageDeadline: futureDeadline,
      knockoutStageDeadline: futureDeadline,
      creatorId: 'org_123',
    })
    tournamentId = tournament.id

    tournamentRepo.updateStatus(tournamentId, 'registration_open')

    const testTimestamp = Date.now()
    const emails = [
      `email_test_1_${testTimestamp}@test.com`,
      `email_test_2_${testTimestamp}@test.com`,
      `email_test_3_${testTimestamp}@test.com`,
      `email_test_4_${testTimestamp}@test.com`,
    ]

    for (const email of emails) {
      playerRepo.findOrCreatePlayerByEmail(email, email.split('@')[0])
    }

    const p1 = playerRepo.findByEmail(emails[0])!
    const p2 = playerRepo.findByEmail(emails[1])!
    const p3 = playerRepo.findByEmail(emails[2])!
    const p4 = playerRepo.findByEmail(emails[3])!

    player1Id = p1.id
    player1Email = p1.email
    player2Id = p2.id
    player2Email = p2.email
    player3Id = p3.id
    player3Email = p3.email
    player4Id = p4.id
    player4Email = p4.email
  })

  afterEach(() => {
    db.close()
  })

  describe('Job execution', () => {
    it('should call processor and return sent/skipped counts', async () => {
      const result = await processEmailSend(
        {
          type: 'registration_confirmation',
          recipientIds: [player1Id],
          data: { tournamentName: 'Test Tournament' },
        },
        { playerRepo, emailAdapter }
      )

      expect(result.sent).toBe(1)
      expect(result.skipped).toBe(0)
    })
  })

  describe('Email generation', () => {
    it('should generate registration confirmation email with correct content', async () => {
      await processEmailSend(
        {
          type: 'registration_confirmation',
          recipientIds: [player1Id],
          data: { tournamentName: 'Spring Tennis Cup' },
        },
        { playerRepo, emailAdapter }
      )

      expect(emailAdapter.sent).toHaveLength(1)
      const email = emailAdapter.sent[0]
      expect(email.to).toBe(player1Email)
      expect(email.subject).toContain('Spring Tennis Cup')
      expect(email.subject).toContain('Registration confirmed')
      expect(email.body).toContain(player1Email.split('@')[0])
      expect(email.body).toContain('Spring Tennis Cup')
    })

    it('should generate partner confirmation email with confirmation link', async () => {
      const confirmationLink = 'https://example.com/confirm?token=abc123'
      await processEmailSend(
        {
          type: 'partner_confirmation',
          recipientIds: [player2Id],
          data: { tournamentName: 'Doubles Event', confirmationLink },
        },
        { playerRepo, emailAdapter }
      )

      expect(emailAdapter.sent).toHaveLength(1)
      const email = emailAdapter.sent[0]
      expect(email.subject).toContain('Doubles Event')
      expect(email.subject).toContain('Partner request')
      expect(email.body).toContain(confirmationLink)
    })

    it('should generate score reminder email with match description and deadline', async () => {
      const deadline = '2026-05-15 18:00 UTC'
      await processEmailSend(
        {
          type: 'score_reminder',
          recipientIds: [player3Id],
          data: { matchDescription: 'Match vs Alice (Court 2)', deadline },
        },
        { playerRepo, emailAdapter }
      )

      expect(emailAdapter.sent).toHaveLength(1)
      const email = emailAdapter.sent[0]
      expect(email.subject).toContain('Score reminder')
      expect(email.subject).toContain('Match vs Alice')
      expect(email.body).toContain(deadline)
    })

    it('should generate bracket published email', async () => {
      await processEmailSend(
        {
          type: 'bracket_published',
          recipientIds: [player1Id],
          data: { tournamentName: 'Finals Tournament' },
        },
        { playerRepo, emailAdapter }
      )

      expect(emailAdapter.sent).toHaveLength(1)
      const email = emailAdapter.sent[0]
      expect(email.subject).toContain('Bracket published')
      expect(email.subject).toContain('Finals Tournament')
      expect(email.body).toContain('bracket')
    })

    it('should generate tournament results email with winner info', async () => {
      await processEmailSend(
        {
          type: 'tournament_results',
          recipientIds: [player4Id],
          data: { tournamentName: 'Grand Slam', winner: 'Alice Smith' },
        },
        { playerRepo, emailAdapter }
      )

      expect(emailAdapter.sent).toHaveLength(1)
      const email = emailAdapter.sent[0]
      expect(email.subject).toContain('Tournament results')
      expect(email.subject).toContain('Grand Slam')
      expect(email.body).toContain('Alice Smith')
    })
  })

  describe('Recipient validation', () => {
    it('should send to exactly the specified recipient IDs', async () => {
      await processEmailSend(
        {
          type: 'registration_confirmation',
          recipientIds: [player1Id, player3Id],
          data: { tournamentName: 'Test' },
        },
        { playerRepo, emailAdapter }
      )

      expect(emailAdapter.sent).toHaveLength(2)
      const recipients = emailAdapter.sent.map(e => e.to).sort()
      expect(recipients).toEqual([player1Email, player3Email].sort())
    })

    it('should not send to players not in recipientIds', async () => {
      await processEmailSend(
        {
          type: 'registration_confirmation',
          recipientIds: [player1Id, player2Id],
          data: { tournamentName: 'Test' },
        },
        { playerRepo, emailAdapter }
      )

      expect(emailAdapter.sent).toHaveLength(2)
      const recipients = emailAdapter.sent.map(e => e.to)
      expect(recipients).not.toContain(player3Email)
      expect(recipients).not.toContain(player4Email)
    })
  })

  describe('Unknown recipient handling', () => {
    it('should skip unknown player IDs and return skipped count', async () => {
      const result = await processEmailSend(
        {
          type: 'registration_confirmation',
          recipientIds: [player1Id, 'unknown_player_id', player2Id],
          data: { tournamentName: 'Test' },
        },
        { playerRepo, emailAdapter }
      )

      expect(result.sent).toBe(2)
      expect(result.skipped).toBe(1)
      expect(emailAdapter.sent).toHaveLength(2)
    })

    it('should handle all unknown recipients gracefully', async () => {
      const result = await processEmailSend(
        {
          type: 'registration_confirmation',
          recipientIds: ['unknown_1', 'unknown_2'],
          data: { tournamentName: 'Test' },
        },
        { playerRepo, emailAdapter }
      )

      expect(result.sent).toBe(0)
      expect(result.skipped).toBe(2)
      expect(emailAdapter.sent).toHaveLength(0)
    })
  })

  describe('Error handling', () => {
    it('should throw on unknown email type', async () => {
      await expect(
        processEmailSend(
          {
            type: 'unknown_type',
            recipientIds: [player1Id],
            data: { tournamentName: 'Test' },
          },
          { playerRepo, emailAdapter }
        )
      ).rejects.toThrow(/Unknown email type/)
    })

    it('should log error and rethrow when adapter send fails', async () => {
      const failingAdapter = {
        async send() {
          throw new Error('SMTP connection failed')
        },
      }

      await expect(
        processEmailSend(
          {
            type: 'registration_confirmation',
            recipientIds: [player1Id],
            data: { tournamentName: 'Test' },
          },
          { playerRepo, emailAdapter: failingAdapter }
        )
      ).rejects.toThrow('SMTP connection failed')
    })
  })

  describe('Idempotent execution', () => {
    it('should process same recipients without duplicate emails', async () => {
      emailAdapter.clear()

      const first = await processEmailSend(
        {
          type: 'registration_confirmation',
          recipientIds: [player1Id, player2Id],
          data: { tournamentName: 'Test' },
        },
        { playerRepo, emailAdapter }
      )

      emailAdapter.clear()

      const second = await processEmailSend(
        {
          type: 'registration_confirmation',
          recipientIds: [player1Id, player2Id],
          data: { tournamentName: 'Test' },
        },
        { playerRepo, emailAdapter }
      )

      expect(first.sent).toBe(2)
      expect(second.sent).toBe(2)
      expect(emailAdapter.sent).toHaveLength(2)
    })
  })

  describe('Deduplication via job queue', () => {
    it('should handle deduplicated jobs correctly', async () => {
      const jobId = `email.send:${player1Id}:registration_confirmation`

      await jobQueue.add(
        'email.send',
        {
          type: 'registration_confirmation',
          recipientIds: [player1Id],
          data: { tournamentName: 'Test' },
        },
        { jobId }
      )

      await jobQueue.add(
        'email.send',
        {
          type: 'registration_confirmation',
          recipientIds: [player1Id],
          data: { tournamentName: 'Test' },
        },
        { jobId }
      )

      expect(jobQueue.getAll()).toHaveLength(1)

      const result = await processEmailSend(
        {
          type: 'registration_confirmation',
          recipientIds: [player1Id],
          data: { tournamentName: 'Test' },
        },
        { playerRepo, emailAdapter }
      )

      expect(result.sent).toBe(1)
      expect(emailAdapter.sent).toHaveLength(1)
    })
  })

  describe('DLQ retry', () => {
    it('should move to failed jobs after max retries', async () => {
      const job = await jobQueue.add('email.send', {
        type: 'registration_confirmation',
        recipientIds: [player1Id],
        data: { tournamentName: 'Test' },
      })
      const jobId = job.id

      expect(job.attemptsMade).toBe(0)
      expect(jobQueue.getFailedJobs()).toHaveLength(0)

      await jobQueue.fail(jobId, 'Attempt 1', 3)
      const after1 = await jobQueue.getJob(jobId)
      expect(after1?.attemptsMade).toBe(1)
      expect(jobQueue.getFailedJobs()).toHaveLength(0)

      await jobQueue.fail(jobId, 'Attempt 2', 3)
      const after2 = await jobQueue.getJob(jobId)
      expect(after2?.attemptsMade).toBe(2)

      await jobQueue.fail(jobId, 'Attempt 3', 3)
      const inQueue = await jobQueue.getJob(jobId)
      expect(inQueue).toBeNull()

      const dlq = jobQueue.getFailedJobs()
      expect(dlq).toHaveLength(1)
      expect(dlq[0].failedReason).toBe('Attempt 3')
    })
  })

  describe('No emailAdapter provided', () => {
    it('should not throw when emailAdapter is not provided', async () => {
      const result = await processEmailSend(
        {
          type: 'registration_confirmation',
          recipientIds: [player1Id],
          data: { tournamentName: 'Test' },
        },
        { playerRepo }
      )

      expect(result.sent).toBe(1)
      expect(result.skipped).toBe(0)
    })
  })

  describe('Multiple recipients with mixed results', () => {
    it('should handle mix of valid and invalid recipients', async () => {
      const result = await processEmailSend(
        {
          type: 'registration_confirmation',
          recipientIds: [player1Id, 'invalid_1', player2Id, 'invalid_2', player3Id],
          data: { tournamentName: 'Test' },
        },
        { playerRepo, emailAdapter }
      )

      expect(result.sent).toBe(3)
      expect(result.skipped).toBe(2)
      expect(emailAdapter.sent).toHaveLength(3)
      const recipients = emailAdapter.sent.map(e => e.to)
      expect(recipients).toEqual(
        expect.arrayContaining([player1Email, player2Email, player3Email])
      )
    })
  })

  describe('Recipient deduplication', () => {
    it('should deduplicate recipients and send only once per distinct ID', async () => {
      const result = await processEmailSend(
        {
          type: 'registration_confirmation',
          recipientIds: [player1Id, player2Id, player1Id, player3Id, player1Id],
          data: { tournamentName: 'Test' },
        },
        { playerRepo, emailAdapter }
      )

      expect(result.sent).toBe(3)
      expect(result.skipped).toBe(0)
      expect(emailAdapter.sent).toHaveLength(3)
      const recipients = emailAdapter.sent.map(e => e.to)
      expect(recipients).toEqual(expect.arrayContaining([player1Email, player2Email, player3Email]))
      const player1Emails = emailAdapter.sent.filter(e => e.to === player1Email)
      expect(player1Emails).toHaveLength(1)
    })

    it('should log duplicates count when present', async () => {
      await processEmailSend(
        {
          type: 'registration_confirmation',
          recipientIds: [player1Id, player1Id, player2Id, player2Id, player2Id],
          data: { tournamentName: 'Test' },
        },
        { playerRepo, emailAdapter }
      )

      expect(emailAdapter.sent).toHaveLength(2)
      const recipients = emailAdapter.sent.map(e => e.to).sort()
      expect(recipients).toEqual([player1Email, player2Email].sort())
    })

    it('should handle all duplicate recipients gracefully', async () => {
      const result = await processEmailSend(
        {
          type: 'registration_confirmation',
          recipientIds: [player1Id, player1Id, player1Id],
          data: { tournamentName: 'Test' },
        },
        { playerRepo, emailAdapter }
      )

      expect(result.sent).toBe(1)
      expect(result.skipped).toBe(0)
      expect(emailAdapter.sent).toHaveLength(1)
      expect(emailAdapter.sent[0].to).toBe(player1Email)
    })
  })
})
