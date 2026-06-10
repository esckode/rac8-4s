import { Pool } from 'pg'
import { TournamentRepository, AccountRepository, openDatabase } from '../src/db'
import { getLogger } from '../src/logger'
import bcryptjs from 'bcryptjs'

const log = getLogger('seed-tournaments')

interface TournamentSeed {
  name: string
  sport: 'pickleball' | 'tennis'
  matchFormat: 'singles' | 'doubles'
  maxPlayers: number
  description?: string
  registrationDeadlineOffset: number // days in the future
  groupStageDeadlineOffset: number // days in the future
  knockoutStageDeadlineOffset: number // days in the future
}

const TEST_TOURNAMENTS: TournamentSeed[] = [
  {
    name: 'Spring Singles Championship',
    sport: 'pickleball',
    matchFormat: 'singles',
    maxPlayers: 16,
    description: 'A competitive singles tournament with group stage and knockout',
    registrationDeadlineOffset: 7,
    groupStageDeadlineOffset: 14,
    knockoutStageDeadlineOffset: 21,
  },
  {
    name: 'Doubles Friendly Open',
    sport: 'pickleball',
    matchFormat: 'doubles',
    maxPlayers: 16,
    description: 'Fun doubles tournament - mixed levels welcome',
    registrationDeadlineOffset: 10,
    groupStageDeadlineOffset: 17,
    knockoutStageDeadlineOffset: 24,
  },
  {
    name: 'Monday Night Smash',
    sport: 'pickleball',
    matchFormat: 'singles',
    maxPlayers: 8,
    description: 'Quick weekly tournament',
    registrationDeadlineOffset: 3,
    groupStageDeadlineOffset: 5,
    knockoutStageDeadlineOffset: 7,
  },
  {
    name: 'Expired Deadline Tournament',
    sport: 'tennis',
    matchFormat: 'doubles',
    maxPlayers: 12,
    description: 'This tournament has passed registration deadline (for testing)',
    registrationDeadlineOffset: -2, // Deadline was 2 days ago
    groupStageDeadlineOffset: 5,
    knockoutStageDeadlineOffset: 12,
  },
]

async function seedTournaments(pool: Pool): Promise<void> {
  const tournamentRepo = new TournamentRepository(pool)
  const accountRepo = new AccountRepository(pool)

  try {
    // Create or get organizer account
    let organizer = await accountRepo.findByEmail('tournament-organizer@test.com')

    if (!organizer) {
      organizer = await accountRepo.create(
        'tournament-organizer@test.com',
        'organizer',
        'active'
      )
      const hash = await bcryptjs.hash('testpass123', 10)
      await accountRepo.updatePasswordHash(organizer.id, hash)
      log.info('account.created', { email: 'tournament-organizer@test.com' })
    }

    // Create tournaments
    for (const tournamentSeed of TEST_TOURNAMENTS) {
      try {
        // Check if tournament already exists
        const existing = await tournamentRepo.findByName(tournamentSeed.name)

        if (existing) {
          log.debug('tournament.exists', { name: tournamentSeed.name })
          continue
        }

        // Calculate deadline dates
        const now = new Date()
        const registrationDeadline = new Date(now)
        registrationDeadline.setDate(registrationDeadline.getDate() + tournamentSeed.registrationDeadlineOffset)

        const groupStageDeadline = new Date(now)
        groupStageDeadline.setDate(groupStageDeadline.getDate() + tournamentSeed.groupStageDeadlineOffset)

        const knockoutStageDeadline = new Date(now)
        knockoutStageDeadline.setDate(knockoutStageDeadline.getDate() + tournamentSeed.knockoutStageDeadlineOffset)

        // Create tournament
        const tournament = await tournamentRepo.create({
          name: tournamentSeed.name,
          sport: tournamentSeed.sport,
          matchFormat: tournamentSeed.matchFormat,
          maxPlayers: tournamentSeed.maxPlayers,
          description: tournamentSeed.description,
          creatorId: organizer.id,
          registrationDeadline: registrationDeadline.toISOString(),
          groupStageDeadline: groupStageDeadline.toISOString(),
          knockoutStageDeadline: knockoutStageDeadline.toISOString(),
        })

        // Transition to registration_open if registration deadline is in future
        if (registrationDeadline > now) {
          await tournamentRepo.updateStatus(tournament.id, 'registration_open')
          log.info('tournament.created', {
            id: tournament.id,
            name: tournament.name,
            format: tournamentSeed.matchFormat,
            status: 'registration_open',
          })
        } else {
          log.info('tournament.created', {
            id: tournament.id,
            name: tournament.name,
            format: tournamentSeed.matchFormat,
            status: 'draft (registration closed)',
          })
        }
      } catch (err) {
        log.error('tournament.creation.failed', {
          name: tournamentSeed.name,
          error: err instanceof Error ? err.message : String(err),
        })
      }
    }
  } catch (err) {
    log.error('seed.failed', {
      error: err instanceof Error ? err.message : String(err),
    })
    throw err
  }
}

// Export for use in other scripts
export { seedTournaments }

// Run directly if called as main module
if (require.main === module) {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://localhost/tournament_app',
  })

  seedTournaments(pool)
    .then(() => {
      log.info('seed.complete')
      process.exit(0)
    })
    .catch((err) => {
      log.error('seed.error', { error: err instanceof Error ? err.message : String(err) })
      process.exit(1)
    })
    .finally(() => {
      pool.end()
    })
}
