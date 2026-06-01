# Doubles Tournament Support Requirements

**Document Version:** 1.0  
**Status:** Design Phase  
**Approach:** Option 3 - Minimal Refactor with Team Participant Model  
**Timeline:** 3-5 days (TDD approach reduces timeline 30-40%)  
**Estimated Scope:** ~1000 lines of code  
**Approach:** Test-Driven Development (TDD) per `TDD_STRATEGY.md`

---

## Executive Summary

This document outlines the implementation of doubles tournament support in RAC8-4S. The approach treats **teams (pairs of players) as the participant unit** instead of individual players for doubles tournaments. This allows groups, matches, standings, and bracket logic to remain identical between singles and doubles—only the participant type changes.

**Key Principle:** Groups, matches, and standings calculations work with any participant type (player for singles, team for doubles). No refactoring of core algorithm logic required.

---

## Architecture Overview

### Current State (Singles Only)

```
Tournament (matchFormat: 'singles')
  ├─ Groups divide players
  ├─ group_memberships (player_id references)
  ├─ group_matches (player1_id, player2_id)
  ├─ group_standings (ranked players)
  └─ knockout_matches (player1_id, player2_id)
```

### Target State (Singles + Doubles)

```
Tournament (matchFormat: 'singles' | 'doubles')

SINGLES PATH:
  ├─ Groups divide players
  ├─ group_memberships (player_id references)
  ├─ group_matches (player1_id, player2_id)
  ├─ group_standings (ranked players)
  └─ knockout_matches (player1_id, player2_id)

DOUBLES PATH:
  ├─ Teams created from registered partnerships
  ├─ Groups divide teams
  ├─ group_memberships (team_id references)
  ├─ group_matches (team1_id, team2_id)
  ├─ group_standings (ranked teams)
  └─ knockout_matches (team1_id, team2_id)
```

### Key Insights

1. **Grouping is orthogonal to teams** — Groups organize participants (players OR teams) into round-robin sub-tournaments
2. **Match generation logic stays identical** — Just iterate over participants instead of hardcoding player iteration
3. **Standings calculation is generic** — Already works with any participant type, just needs parameter rename
4. **Conditional logic is localized** — Only in group formation and match generation (not in core algorithms)

---

## Phase 1: Database Schema

**Duration:** 1 day  
**Risk Level:** Low (additive only, no breaking changes)  
**Rollback:** Drop migrations if needed

### Task 1.1: Create Teams Table

**File:** `db/migrations/016_add_teams_table.sql`

**Implementation:**
```sql
CREATE TABLE public.teams (
  id TEXT PRIMARY KEY,
  tournament_id TEXT NOT NULL REFERENCES public.tournaments(id),
  player1_id TEXT NOT NULL REFERENCES public.players(id),
  player2_id TEXT NOT NULL REFERENCES public.players(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  
  UNIQUE(tournament_id, player1_id, player2_id),
  CONSTRAINT different_players CHECK (player1_id != player2_id)
);

CREATE INDEX idx_teams_tournament ON public.teams(tournament_id);
CREATE INDEX idx_teams_player1 ON public.teams(player1_id);
CREATE INDEX idx_teams_player2 ON public.teams(player2_id);
```

**Acceptance Criteria:**
- ✅ Table created with all columns
- ✅ Foreign keys reference correct tables
- ✅ Unique constraint prevents duplicate teams
- ✅ Indexes created for fast lookups
- ✅ Migration is idempotent (safe to re-run)

---

### Task 1.2: Extend group_memberships (Polymorphic)

**File:** `db/migrations/017_extend_group_memberships.sql`

**Implementation:**
```sql
-- Add team_id column to group_memberships
ALTER TABLE public.group_memberships 
ADD COLUMN team_id TEXT REFERENCES public.teams(id);

-- Constraint: must have EITHER player_id OR team_id, never both
ALTER TABLE public.group_memberships 
ADD CONSTRAINT check_membership_type 
CHECK (
  (player_id IS NOT NULL AND team_id IS NULL) OR
  (player_id IS NULL AND team_id IS NOT NULL)
);

-- Create index for team lookups
CREATE INDEX idx_group_memberships_team ON public.group_memberships(team_id);
```

**Acceptance Criteria:**
- ✅ Column added to existing table
- ✅ Constraint enforces mutual exclusivity
- ✅ All existing records remain valid (player_id filled, team_id NULL)
- ✅ Index created
- ✅ Migration is backwards compatible

**Data Integrity Check:**
```sql
-- Verify no existing records violate constraint
SELECT COUNT(*) FROM group_memberships 
WHERE (player_id IS NULL AND team_id IS NULL) 
   OR (player_id IS NOT NULL AND team_id IS NOT NULL);
-- Result should be 0
```

---

### Task 1.3: Extend group_matches (Polymorphic)

**File:** `db/migrations/018_extend_group_matches.sql`

**Implementation:**
```sql
-- Add team columns to group_matches
ALTER TABLE public.group_matches 
ADD COLUMN team1_id TEXT REFERENCES public.teams(id);

ALTER TABLE public.group_matches 
ADD COLUMN team2_id TEXT REFERENCES public.teams(id);

-- Add team winner_id (optional, for consistency)
-- Note: winner_id stays as TEXT, can be player or team ID

-- Constraint: must have EITHER (player1_id, player2_id) OR (team1_id, team2_id)
ALTER TABLE public.group_matches
ADD CONSTRAINT check_match_type 
CHECK (
  (player1_id IS NOT NULL AND player2_id IS NOT NULL AND team1_id IS NULL AND team2_id IS NULL) OR
  (player1_id IS NULL AND player2_id IS NULL AND team1_id IS NOT NULL AND team2_id IS NOT NULL)
);

-- Create indexes
CREATE INDEX idx_group_matches_team1 ON public.group_matches(team1_id);
CREATE INDEX idx_group_matches_team2 ON public.group_matches(team2_id);
```

**Acceptance Criteria:**
- ✅ Columns added to existing table
- ✅ Constraint enforces match type exclusivity
- ✅ All existing records remain valid
- ✅ Indexes created for team lookups
- ✅ Migration is backwards compatible

**Data Integrity Check:**
```sql
-- Verify no existing records violate constraint
SELECT COUNT(*) FROM group_matches 
WHERE (player1_id IS NULL AND player2_id IS NULL AND team1_id IS NULL AND team2_id IS NULL)
   OR (player1_id IS NOT NULL AND team1_id IS NOT NULL);
-- Result should be 0
```

---

### Task 1.4: Extend knockout_matches (Same as group_matches)

**File:** `db/migrations/019_extend_knockout_matches.sql`

**Implementation:**
```sql
ALTER TABLE public.knockout_matches 
ADD COLUMN team1_id TEXT REFERENCES public.teams(id);

ALTER TABLE public.knockout_matches 
ADD COLUMN team2_id TEXT REFERENCES public.teams(id);

ALTER TABLE public.knockout_matches
ADD CONSTRAINT check_knockout_match_type 
CHECK (
  (player1_id IS NOT NULL AND player2_id IS NOT NULL AND team1_id IS NULL AND team2_id IS NULL) OR
  (player1_id IS NULL AND player2_id IS NULL AND team1_id IS NOT NULL AND team2_id IS NOT NULL)
);

CREATE INDEX idx_knockout_matches_team1 ON public.knockout_matches(team1_id);
CREATE INDEX idx_knockout_matches_team2 ON public.knockout_matches(team2_id);
```

**Acceptance Criteria:**
- ✅ Same structure as group_matches
- ✅ Constraints enforce consistency
- ✅ Indexes created
- ✅ Backwards compatible

---

## Phase 2: Core Logic - Group Formation & Match Generation

**Duration:** 1.5 days (reduced from 2 due to TDD efficiency)  
**Risk Level:** Medium (modifies match generation algorithm)  
**Rollback:** Feature-flag off, revert to single-player logic

**TDD Approach:** RED-GREEN-REFACTOR cycle

---

### Phase 2.RED: Write Tests for Group Formation & Matching

**Task 2.0.1: Write Tests - Team Model**

**File:** `packages/core-logic/src/__tests__/teams.spec.ts` (write tests first)

**Test Structure:**

```typescript
describe('Team Model', () => {
  describe('generateTeamId', () => {
    it('should generate unique team IDs', () => {
      const id1 = generateTeamId()
      const id2 = generateTeamId()
      expect(id1).not.toBe(id2)
      expect(id1).toMatch(/^team_/)
    })

    it('should generate string IDs', () => {
      const id = generateTeamId()
      expect(typeof id).toBe('string')
    })
  })

  describe('validateTeamPlayers', () => {
    it('should throw when both players are the same', () => {
      expect(() => validateTeamPlayers('p1', 'p1')).toThrow('Team must contain two different players')
    })

    it('should not throw when players are different', () => {
      expect(() => validateTeamPlayers('p1', 'p2')).not.toThrow()
    })
  })

  describe('Team interface', () => {
    it('should have required properties', () => {
      const team: Team = {
        id: 'team_1',
        tournamentId: 'tourney_1',
        player1Id: 'p1',
        player2Id: 'p2',
        createdAt: new Date()
      }
      expect(team.id).toBeDefined()
      expect(team.tournamentId).toBeDefined()
      expect(team.player1Id).toBeDefined()
      expect(team.player2Id).toBeDefined()
    })
  })
})
```

**Acceptance Criteria:**
- ✅ Team interface defined
- ✅ generateTeamId tests written (passes on implementation)
- ✅ validateTeamPlayers tests written (passes on implementation)
- ✅ 10+ test cases covering edge cases
- ✅ Tests are RED (failing) until implementation done

---

**Task 2.0.2: Write Tests - Group Formation**

**File:** `packages/api/src/__tests__/integration/doubles-group-formation.spec.ts` (write tests first)

**Test Structure:**

```typescript
describe('Doubles: Group Formation (RED)', () => {
  it('should create teams from confirmed partnerships', async () => {
    const tournament = await createTournament({ matchFormat: 'doubles' })
    await registerPlayerWithPartner(tournament.id, 'alice@test.com', 'bob@test.com')
    await registerPlayerWithPartner(tournament.id, 'charlie@test.com', 'diana@test.com')
    
    // This should FAIL until implementation
    await expect(() => 
      advanceTournament(tournament.id, 'to_group_stage')
    ).not.toThrow()
    
    const teams = await getTeamsInTournament(tournament.id)
    expect(teams).toHaveLength(2)
    expect(teams[0]).toMatchObject({
      player1Id: expect.any(String),
      player2Id: expect.any(String)
    })
  })

  it('should divide 4 teams into 1 group of 4', async () => {
    const tournament = await setupDoublesTournament(4)
    await advanceTournament(tournament.id, 'to_group_stage')
    
    const groups = await getGroupsForTournament(tournament.id)
    expect(groups).toHaveLength(1)
    expect(groups[0].teamCount).toBe(4)
  })

  it('should divide 8 teams into 2 groups (4 and 4)', async () => {
    const tournament = await setupDoublesTournament(8)
    await advanceTournament(tournament.id, 'to_group_stage')
    
    const groups = await getGroupsForTournament(tournament.id)
    expect(groups).toHaveLength(2)
    const sizes = groups.map(g => g.teamCount).sort()
    expect(sizes).toEqual([4, 4])
  })

  it('should divide 6 teams into 2 groups (3 and 3)', async () => {
    const tournament = await setupDoublesToournament(6)
    await advanceTournament(tournament.id, 'to_group_stage')
    
    const groups = await getGroupsForTournament(tournament.id)
    expect(groups).toHaveLength(2)
    const sizes = groups.map(g => g.teamCount)
    expect(sizes).toContain(3)
    expect(sizes).toContain(3)
  })
})
```

**Acceptance Criteria:**
- ✅ Group formation tests written
- ✅ All group sizing scenarios covered
- ✅ 12+ test cases
- ✅ Tests are RED until implementation

---

**Task 2.0.3: Write Tests - Match Generation**

**File:** `packages/api/src/__tests__/integration/doubles-group-formation.spec.ts` (add to same file)

**Test Structure:**

```typescript
describe('Doubles: Round-Robin Match Generation (RED)', () => {
  it('should generate n*(n-1)/2 matches for n teams', async () => {
    const tournament = await setupDoublesTournament(4)
    const matches = await getGroupMatches(tournament.groupId)
    
    // 4 teams = 4*3/2 = 6 matches
    expect(matches).toHaveLength(6)
  })

  it('should use team_id columns for doubles matches', async () => {
    const tournament = await setupDoublesTournament(4)
    const matches = await getGroupMatches(tournament.groupId)
    
    matches.forEach(match => {
      expect(match.team1_id).toBeDefined()
      expect(match.team2_id).toBeDefined()
      expect(match.player1_id).toBeNull()
      expect(match.player2_id).toBeNull()
    })
  })

  it('should not generate matches between same team twice', async () => {
    const tournament = await setupDoublesTournament(4)
    const matches = await getGroupMatches(tournament.groupId)
    
    const pairs = matches.map(m => [m.team1_id, m.team2_id].sort())
    const uniquePairs = new Set(pairs.map(p => JSON.stringify(p)))
    expect(uniquePairs.size).toBe(matches.length)
  })

  it('should create all matches with pending status', async () => {
    const tournament = await setupDoublesTournament(4)
    const matches = await getGroupMatches(tournament.groupId)
    
    matches.forEach(match => {
      expect(match.status).toBe('pending')
    })
  })

  it('should include created_at timestamp', async () => {
    const tournament = await setupDoublesToournament(4)
    const matches = await getGroupMatches(tournament.groupId)
    
    matches.forEach(match => {
      expect(match.created_at).toBeDefined()
      expect(match.created_at).toBeInstanceOf(Date)
    })
  })
})
```

**Acceptance Criteria:**
- ✅ Match generation tests written
- ✅ Combinatorial logic verified
- ✅ 10+ test cases
- ✅ Tests are RED until implementation

---

### Phase 2.GREEN: Implement to Pass Tests

### Task 2.1: Create Team Creation Helper

**File:** `packages/core-logic/src/teams.ts` (new file)

**Implementation:**
```typescript
export interface Team {
  id: string
  tournamentId: string
  player1Id: string
  player2Id: string
  createdAt: Date
}

export function generateTeamId(): string {
  return `team_${Date.now()}_${Math.random().toString(36).slice(2)}`
}

export function validateTeamPlayers(player1Id: string, player2Id: string): void {
  if (player1Id === player2Id) {
    throw new Error('Team must contain two different players')
  }
}
```

**Acceptance Criteria:**
- ✅ Team interface defined
- ✅ ID generation function works
- ✅ Validation catches same-player teams
- ✅ Exported for use in repositories

---

### Task 2.2: Add Team Repository Methods

**File:** `packages/api/src/repositories/team-repository.ts` (new file)

**Implementation:**
```typescript
export class TeamRepository {
  async createTeam(
    tournamentId: string,
    player1Id: string,
    player2Id: string
  ): Promise<Team>

  async findTeamsByTournament(tournamentId: string): Promise<Team[]>

  async getTeamsInGroup(groupId: string): Promise<Team[]>

  async findTeamById(teamId: string): Promise<Team | null>

  async getTeamPlayers(teamId: string): Promise<{ player1Id: string; player2Id: string }>
}
```

**Acceptance Criteria:**
- ✅ Create method inserts team record
- ✅ Query methods return team data
- ✅ No duplicate teams per partnership
- ✅ Typed return values

---

### Task 2.3: Implement Group Formation Logic

**File:** `packages/api/src/db.ts` (modify existing)

**Current code location:** Search for "Generate groups and matches"

**Implementation:** Write code to pass tests from Phase 2.0.2

Replace monolithic group formation with conditional branches:

```typescript
async function formGroups(tournamentId: string, players: Player[], tournament: any) {
  const matchFormat = tournament.match_format
  
  if (matchFormat === 'doubles') {
    await formGroupsDoubles(tournamentId, players, tournament)
  } else {
    await formGroupsSingles(tournamentId, players, tournament)
  }
}

async function formGroupsSingles(
  tournamentId: string,
  players: Player[],
  tournament: any
): Promise<void> {
  // Existing logic, unchanged
  // Divide players into groups
  // Generate round-robin between PLAYERS
}

async function formGroupsDoubles(
  tournamentId: string,
  players: Player[],
  tournament: any
): Promise<void> {
  // New logic for doubles
  const partnerships = await playerRepo.getTeamRegistrations(tournamentId)
  const teams = await createTeamsFromPartnerships(tournamentId, partnerships)
  
  // Divide TEAMS into groups (same sizing logic)
  const groupSize = calculateGroupSize(teams.length)
  
  for (let i = 0; i < Math.ceil(teams.length / groupSize); i++) {
    const groupId = generateGroupId()
    const groupTeams = teams.slice(i * groupSize, (i + 1) * groupSize)
    
    // Insert group
    await client.query(
      'INSERT INTO groups (id, tournament_id, name) VALUES ($1, $2, $3)',
      [groupId, tournamentId, `Group ${i + 1}`]
    )
    
    // Add team memberships
    for (const team of groupTeams) {
      await client.query(
        'INSERT INTO group_memberships (group_id, team_id) VALUES ($1, $2)',
        [groupId, team.id]
      )
    }
    
    // Generate round-robin matches between TEAMS
    await generateGroupMatchesDoubles(groupId, groupTeams)
  }
}
```

**Acceptance Criteria:**
- ✅ Singles path unchanged (regression suite passes)
- ✅ Doubles path creates teams from partnerships
- ✅ Teams properly grouped
- ✅ Feature-flagged (can disable)
- ✅ All existing tests still pass

---

### Task 2.4: Implement Match Generation

**File:** `packages/api/src/db.ts` (modify existing)

**Current code location:** Search for "Generate round-robin"

**Implementation:** Write code to pass tests from Phase 2.0.3

```typescript
async function generateGroupMatchesSingles(groupId: string, players: Player[]): Promise<void> {
  // Existing logic: round-robin between PLAYERS
  for (let j = 0; j < players.length; j++) {
    for (let k = j + 1; k < players.length; k++) {
      const matchId = generateMatchId()
      await client.query(
        `INSERT INTO group_matches 
         (id, group_id, player1_id, player2_id, status, created_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [matchId, groupId, players[j].id, players[k].id, 'pending', now]
      )
    }
  }
}

async function generateGroupMatchesDoubles(groupId: string, teams: Team[]): Promise<void> {
  // New logic: round-robin between TEAMS
  for (let j = 0; j < teams.length; j++) {
    for (let k = j + 1; k < teams.length; k++) {
      const matchId = generateMatchId()
      await client.query(
        `INSERT INTO group_matches 
         (id, group_id, team1_id, team2_id, status, created_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [matchId, groupId, teams[j].id, teams[k].id, 'pending', now]
      )
    }
  }
}
```

**Acceptance Criteria:**
- ✅ Singles matches use player columns
- ✅ Doubles matches use team columns
- ✅ Round-robin count correct (n*(n-1)/2)
- ✅ All matches created with pending status
- ✅ No matches between same participant twice
- ✅ **All tests from Phase 2.0 pass GREEN**

---

### Phase 2.REFACTOR: Refactor While Maintaining Test Pass

**Task 2.5: Refactor Group Formation & Match Generation**

**Scope:** While all tests pass, optimize for readability and maintainability

```typescript
// Review these aspects for refactoring:
// 1. Extract helper functions (e.g., calculateGroupSize)
// 2. Simplify match generation loop
// 3. Add meaningful variable names
// 4. Consolidate error handling
// 5. Add code comments where logic is non-obvious

// Example refactor:
function calculateGroupSize(participantCount: number): number {
  // Groups of 3-4 are ideal for round-robin (6-12 matches per group)
  if (participantCount <= 4) return participantCount
  if (participantCount <= 8) return 4
  return 3
}
```

**Acceptance Criteria:**
- ✅ Code more readable and maintainable
- ✅ All tests still pass (GREEN)
- ✅ No logic changes (same output)
- ✅ No performance regressions
- ✅ Commented only where WHY is non-obvious

**Verification:**
```bash
npm test -- packages/core-logic/src/__tests__/teams.spec.ts
npm test -- packages/api/src/__tests__/integration/doubles-group-formation.spec.ts
# All tests should PASS
```

---

## Phase 2.5: Partner Registration & Confirmation (Doubles-Specific)

**Duration:** 1 day (reduced from 1.5 due to TDD efficiency)  
**Risk Level:** Medium (new endpoints, partner state management)  
**Rollback:** Disable doubles registrations, revert API endpoints

**Dependencies:** Phase 1 (database schema with partner_id already exists)

**TDD Approach:** RED-GREEN-REFACTOR cycle

---

### Phase 2.5.RED: Write Tests for Partner Confirmation

**Task 2.5.0.1: Write Tests - Partner Confirmation Endpoint**

**File:** `packages/api/src/__tests__/integration/doubles-partner-confirmation.spec.ts` (write tests first)

**Test Structure:**

```typescript
describe('Doubles: Partner Confirmation (RED)', () => {
  it('should allow player to confirm partnership', async () => {
    const tournament = await createTournament({ matchFormat: 'doubles' })
    const player1 = await createPlayer('alice@test.com')
    const player2 = await createPlayer('bob@test.com')
    
    // Create partnership registrations
    const reg = await createPartnershipRegistrations(
      tournament.id,
      player1.id,
      player2.id,
      'select'
    )

    // Bob confirms his registration
    const response = await patch(
      `/registrations/${reg.player2RegistrationId}/confirm`,
      {},
      { auth: player2 }
    )

    expect(response.status).toBe(200)
    expect(response.body.confirmed).toBe(true)
    expect(response.body.partnership.bothConfirmed).toBe(false) // Alice not confirmed yet
  })

  it('should reject confirmation from non-partner', async () => {
    // ... setup ...
    const response = await patch(
      `/registrations/${reg.id}/confirm`,
      {},
      { auth: unrelatedPlayer }
    )
    expect(response.status).toBe(403)
  })

  it('should indicate when both partners confirmed', async () => {
    // ... setup both confirmations ...
    const response = await getConfirmationStatus(reg.id)
    expect(response.bothConfirmed).toBe(true)
  })

  it('should log partnership.confirmed at INFO level', async () => {
    // ... setup and confirm ...
    const logs = await getLogs()
    expect(logs).toContainEqual(
      expect.objectContaining({
        level: 'info',
        event: 'partnership.confirmed',
        playerId: player2.id,
        partnerId: player1.id,
        tournamentId: tournament.id
      })
    )
  })
})
```

**Acceptance Criteria:**
- ✅ Partner confirmation tests written
- ✅ Logging behavior tested
- ✅ 15+ test cases
- ✅ Tests are RED until implementation

---

**Task 2.5.0.2: Write Tests - Partner Selection & Registration**

**File:** `packages/api/src/__tests__/integration/doubles-partner-confirmation.spec.ts` (add to same file)

**Test Structure:**

```typescript
describe('Doubles: Partner Selection & Registration (RED)', () => {
  it('should validate partner selection required for doubles', async () => {
    const tournament = await createTournament({ matchFormat: 'doubles' })
    
    const response = await post(
      `/tournaments/${tournament.id}/register`,
      {
        email: 'alice@test.com',
        name: 'Alice'
        // Missing partnerSelection
      }
    )

    expect(response.status).toBe(400)
    expect(response.body.message).toContain('Partner selection required')
  })

  it('should create paired registrations for select type', async () => {
    const tournament = await createTournament({ matchFormat: 'doubles' })
    const player2 = await createPlayer('bob@test.com')

    const response = await post(
      `/tournaments/${tournament.id}/register`,
      {
        email: 'alice@test.com',
        name: 'Alice',
        partnerSelection: { type: 'select', value: player2.id }
      }
    )

    expect(response.status).toBe(201)
    
    // Verify both registrations exist
    const aliceReg = await findRegistration('alice@test.com', tournament.id)
    const bobReg = await findRegistration('bob@test.com', tournament.id)
    
    expect(aliceReg.partner_id).toBe(player2.id)
    expect(bobReg.partner_id).toBe(aliceReg.player_id)
  })

  it('should send confirmation email for select type', async () => {
    // ... setup ...
    const emails = await getQueuedEmails()
    expect(emails).toHaveLength(1)
    expect(emails[0].template).toBe('partner_confirmation')
    expect(emails[0].to).toBe('bob@test.com')
  })

  it('should create paired registrations for invite type', async () => {
    const tournament = await createTournament({ matchFormat: 'doubles' })

    const response = await post(
      `/tournaments/${tournament.id}/register`,
      {
        email: 'alice@test.com',
        name: 'Alice',
        partnerSelection: { type: 'invite', value: 'bob@notyet.com' }
      }
    )

    expect(response.status).toBe(201)
    
    // Verify registrations created (even though bob doesn't exist yet)
    const regs = await getRegistrationsByTournament(tournament.id)
    expect(regs).toHaveLength(1) // Only alice registered
  })

  it('should send invite email for invite type', async () => {
    // ... setup ...
    const emails = await getQueuedEmails()
    expect(emails[0].template).toBe('partner_invite')
    expect(emails[0].to).toBe('bob@notyet.com')
    expect(emails[0].data.signupLink).toContain('token=')
  })

  it('should log team.created at INFO level', async () => {
    // ... setup registration ...
    const logs = await getLogs()
    expect(logs).toContainEqual(
      expect.objectContaining({
        level: 'info',
        event: 'team.created',
        tournamentId: tournament.id,
        player1Id: expect.any(String),
        player2Id: expect.any(String),
        registrationType: 'select'
      })
    )
  })
})
```

**Acceptance Criteria:**
- ✅ Partner selection and registration tests written
- ✅ Both select and invite flows tested
- ✅ Email sending verified
- ✅ Logging tested
- ✅ 20+ test cases
- ✅ Tests are RED until implementation

---

### Phase 2.5.GREEN: Implement Partner Confirmation & Registration

### Task 2.5.1: Add Partner Confirmation Endpoint

**File:** `packages/api/src/routes/tournaments.ts` (new endpoint)

**Endpoint:** `PATCH /registrations/:registrationId/confirm`

**Implementation:**
```typescript
router.patch('/registrations/:registrationId/confirm', async (req, res, next) => {
  try {
    const payload = await requirePlayerSessionAuth(req.headers.authorization, deps.tokenStore)
    const registrationId = req.params.registrationId as string

    // Get registration
    const registration = await playerRepo.findRegistrationById(registrationId)
    if (!registration) {
      return res.status(404).json({ code: 'NOT_FOUND', message: 'Registration not found' })
    }

    // Verify player is confirming their own registration
    if (registration.player_id !== payload.playerId) {
      return res.status(403).json({ code: 'FORBIDDEN', message: 'Cannot confirm others registrations' })
    }

    // Mark as confirmed
    await playerRepo.confirmPartnershipRegistration(registrationId)

    // Check if both partners confirmed
    const partnerReg = await playerRepo.findPartnerRegistration(
      registration.tournament_id,
      registration.partner_id
    )

    const bothConfirmed = registration.partner_confirmed && partnerReg?.partner_confirmed

    return res.status(200).json({
      confirmed: true,
      partnership: {
        registrationId,
        playerId: registration.player_id,
        partnerId: registration.partner_id,
        partnerConfirmed: registration.partner_confirmed,
        bothConfirmed,
        confirmedAt: new Date()
      },
      message: bothConfirmed ? 'Partnership confirmed!' : 'Waiting for partner confirmation'
    })
  } catch (err) {
    next(err)
  }
})
```

**Acceptance Criteria:**
- ✅ Endpoint accessible only to authenticated players
- ✅ Only the registered player can confirm
- ✅ Mark player's registration as confirmed
- ✅ Return confirmation status
- ✅ Indicate if both partners confirmed
- ✅ Error handling for invalid/missing registration
- ✅ **Structured logging at INFO level:**
  - Log `partnership.confirmed` when player confirms
  - Include: `playerId`, `partnerId`, `tournamentId`
  - Use module-level logger: `const log = getLogger('partnerships')`
  - Never include: tokens, passwords, full request bodies

---

### Task 2.5.2a: Add Partner Selection Validation

**File:** `packages/api/src/routes/tournaments.ts` (modify registration endpoint)

**Implementation:** Add validation layer for partner selection

```typescript
function validatePartnerSelection(partnerSelection: any, email: string): { valid: boolean; error?: string } {
  if (!partnerSelection) {
    return { valid: false, error: 'Partner selection required for doubles tournament' }
  }

  if (!['select', 'invite'].includes(partnerSelection.type)) {
    return { valid: false, error: 'Invalid partner selection type' }
  }

  if (partnerSelection.type === 'select') {
    if (!partnerSelection.value || typeof partnerSelection.value !== 'string') {
      return { valid: false, error: 'Partner ID required' }
    }
  } else if (partnerSelection.type === 'invite') {
    if (!isValidEmail(partnerSelection.value)) {
      return { valid: false, error: 'Invalid email format' }
    }
    if (partnerSelection.value === email) {
      return { valid: false, error: 'Cannot partner with yourself' }
    }
  }

  return { valid: true }
}
```

**Acceptance Criteria:**
- ✅ Validates partnerSelection parameter exists
- ✅ Validates type is 'select' or 'invite'
- ✅ Validates partnerId for select case
- ✅ Validates email for invite case
- ✅ Prevents self-pairing
- ✅ Returns validation errors with messages

---

### Task 2.5.2b: Create Dual Partner Registrations

**File:** `packages/api/src/routes/tournaments.ts` (new helper function)

**Implementation:** Create paired registrations in database

```typescript
async function createPartnershipRegistrations(
  tournamentId: string,
  player1Id: string,
  player2Id: string,
  partnershipType: 'select' | 'invite'
): Promise<{ reg1: Registration; reg2: Registration }> {
  const now = new Date()
  
  const reg1 = {
    id: generateRegistrationId(),
    tournament_id: tournamentId,
    player_id: player1Id,
    partner_id: player2Id,
    partner_confirmed: partnershipType === 'invite' ? true : false,
    status: partnershipType === 'invite' ? 'registered' : 'pending_partner_confirm',
    registered_at: now
  }

  const reg2 = {
    id: generateRegistrationId(),
    tournament_id: tournamentId,
    player_id: player2Id,
    partner_id: player1Id,
    partner_confirmed: false,  // Always false - other player must confirm
    status: 'pending_partner_confirm',
    registered_at: now
  }

  await playerRepo.createRegistration(reg1)
  await playerRepo.createRegistration(reg2)

  return { reg1, reg2 }
}
```

**Acceptance Criteria:**
- ✅ Create bidirectional registration records
- ✅ Set correct confirmation status (select vs invite)
- ✅ Prevent duplicate partnerships
- ✅ Store registration timestamps
- ✅ Return both registration records
- ✅ **Structured logging at INFO level:**
  - Log `team.created` when partnership registrations created
  - Include: `tournamentId`, `player1Id`, `player2Id`, `registrationType` (select|invite)
  - Use repository-level logger for database operations

---

### Task 2.5.2c: Send Partner Notification Emails

**File:** `packages/api/src/routes/tournaments.ts` (new helper function)

**Implementation:** Queue appropriate email for each scenario

```typescript
async function sendPartnerNotificationEmail(
  scenario: 'select' | 'invite',
  partner: { id: string; email: string; name: string },
  inviter: { name: string },
  tournament: { name: string },
  registrationId: string
): Promise<void> {
  if (scenario === 'select') {
    // Scenario A: You selected an existing player
    await emailQueue.enqueue({
      to: partner.email,
      template: 'partner_confirmation',
      data: {
        partnerName: inviter.name,
        tournamentName: tournament.name,
        confirmLink: `${process.env.FRONTEND_URL}/registrations/${registrationId}/confirm`,
        deadline: addDays(new Date(), 1)
      }
    })
  } else if (scenario === 'invite') {
    // Scenario B: You invited someone new
    const partnerToken = generateMagicLinkToken(24 * 7)  // 7-day TTL
    
    await emailQueue.enqueue({
      to: partner.email,
      template: 'partner_invite',
      data: {
        inviterName: inviter.name,
        tournamentName: tournament.name,
        signupLink: `${process.env.FRONTEND_URL}/signup?token=${partnerToken}`,
        deadline: addDays(new Date(), 7)
      }
    })
  }
}
```

**Acceptance Criteria:**
- ✅ Send confirmation email for existing partner
- ✅ Send signup invite for new partner
- ✅ Include correct deadline
- ✅ Include confirmation/signup links
- ✅ Queue emails for async processing
- ✅ Handle email failures gracefully
- ✅ **Structured logging at DEBUG/INFO level:**
  - Log at DEBUG when email queued: `email.queued`
  - Log at WARN if email fails: `email.send_failed`
  - Include: `recipientEmail`, `emailType` (confirmation|invite), `tournamentId`
  - Never include: actual email content, token values

---

### Task 2.5.3: Add Partner Registration Repository Methods

**File:** `packages/api/src/repositories/player-repository.ts` (extend existing)

```typescript
export class PlayerRepository {
  async findPartnerRegistration(
    tournamentId: string,
    partnerId: string
  ): Promise<Registration | null>
  
  async confirmPartnershipRegistration(registrationId: string): Promise<void>
  
  async findRegistrationByPlayerAndTournament(
    playerId: string,
    tournamentId: string
  ): Promise<Registration | null>
  
  async getTeamConfirmationStatus(tournamentId: string): Promise<{
    teamId: string
    player1Id: string
    player1Confirmed: boolean
    player2Id: string
    player2Confirmed: boolean
    bothConfirmed: boolean
  }[]>
}
```

**Acceptance Criteria:**
- ✅ Find partner registration for tournament
- ✅ Mark registration as confirmed
- ✅ Get confirmation status for all teams
- ✅ **Logging in repository methods:**
  - Log at DEBUG level for database queries
  - Log at WARN if partner registration not found (expected case)
  - Include: relevant IDs, tournament context
  - Use module-level logger: `const log = getLogger('player-repository')`

---

### Task 2.5.4: Add Partner Email Templates

**File:** `packages/api/src/email/templates/` (new templates)

**Template 1: partner_confirmation.hbs**
```handlebars
<h2>Confirm Your Team</h2>

<p>Hi {{partnerName}},</p>

<p>You've been paired with {{inviterName}} for <strong>{{tournamentName}}</strong>!</p>

<p><a href="{{confirmLink}}" class="btn btn-primary">Confirm Partnership</a></p>

<p>If you accept, you'll be ready for the group stage.</p>

<p>
  <small>
    This link expires in 24 hours.<br>
    Deadline: {{deadline}}
  </small>
</p>
```

**Template 2: partner_invite.hbs**
```handlebars
<h2>Join a Team</h2>

<p>Hi {{partnerName}},</p>

<p>{{inviterName}} has invited you to team up for <strong>{{tournamentName}}</strong>!</p>

<p>To accept and create your account, click below:</p>

<p><a href="{{signupLink}}" class="btn btn-primary">Accept & Create Account</a></p>

<p>Once you sign up, you'll automatically be confirmed as their partner.</p>

<p>
  <small>
    This link expires in 7 days.<br>
    Deadline: {{deadline}}
  </small>
</p>
```

**Acceptance Criteria:**
- ✅ Both templates created and tested
- ✅ Links include proper tokens with expiration
- ✅ Clear call-to-action
- ✅ Deadline information included

---

---

### Phase 2.5.REFACTOR: Refactor While Maintaining Test Pass

**Task 2.5.6: Refactor Partner Registration & Confirmation**

**Scope:** While all tests pass, optimize partner flow

```typescript
// Review these aspects for refactoring:
// 1. Consolidate validation logic
// 2. Extract email queuing to separate function
// 3. Simplify partnership creation flow
// 4. Add meaningful comments only where WHY is non-obvious
```

**Acceptance Criteria:**
- ✅ Code more readable and maintainable
- ✅ All tests from Phase 2.5.0 still pass
- ✅ No logic changes
- ✅ Email handling cleaner
- ✅ Error handling consistent

**Verification:**
```bash
npm test -- packages/api/src/__tests__/integration/doubles-partner-confirmation.spec.ts
# All tests should PASS
```

---

## Phase 3: Standings Calculation

**Duration:** 0.75 days (reduced from 1 day due to TDD efficiency)  
**Risk Level:** Low (generic refactor, backwards compatible)  
**Rollback:** Revert type changes only

**TDD Approach:** RED-GREEN-REFACTOR cycle

---

### Phase 3.RED: Write Tests for Standings Calculation

**Task 3.0.1: Write Tests - Generic Standings Calculation**

**File:** `packages/core-logic/src/__tests__/standings.spec.ts` (modify existing to add RED tests)

**Test Structure:**

```typescript
describe('Standings Calculation (RED - Generic Participants)', () => {
  describe('calculateStandings with teams', () => {
    it('should calculate standings for team participants', () => {
      const teams = [
        { id: 'team_1' },
        { id: 'team_2' }
      ]
      
      const matches = [
        {
          participant1Id: 'team_1',
          participant2Id: 'team_2',
          winnerId: 'team_1',
          score: '2-1'
        }
      ]

      const standings = calculateStandings(teams, matches)
      
      expect(standings[0].participantId).toBe('team_1')
      expect(standings[0].wins).toBe(1)
      expect(standings[1].participantId).toBe('team_2')
      expect(standings[1].wins).toBe(0)
    })

    it('should work with playerIds (backwards compatibility)', () => {
      const players = [
        { id: 'p1' },
        { id: 'p2' }
      ]
      
      const matches = [
        {
          participant1Id: 'p1',
          participant2Id: 'p2',
          winnerId: 'p1',
          score: '2-1'
        }
      ]

      const standings = calculateStandings(players, matches)
      expect(standings[0].participantId).toBe('p1')
    })

    it('should apply tiebreakers for teams with same wins', () => {
      const teams = [
        { id: 'team_1' },
        { id: 'team_2' }
      ]
      
      const matches = [
        { participant1Id: 'team_1', participant2Id: 'team_2', winnerId: 'team_1', score: '2-1' },
        { participant1Id: 'team_2', participant2Id: 'team_1', winnerId: 'team_2', score: '2-0' }
      ]

      const standings = calculateStandings(teams, matches)
      // Both have 1 win, but team_1 won 2 sets total
      expect(standings[0].participantId).toBe('team_1')
    })

    it('should handle head-to-head tiebreaker', () => {
      const teams = [
        { id: 'team_1' },
        { id: 'team_2' },
        { id: 'team_3' }
      ]
      
      const matches = [
        { participant1Id: 'team_1', participant2Id: 'team_2', winnerId: 'team_1', score: '2-0' },
        { participant1Id: 'team_1', participant2Id: 'team_3', winnerId: 'team_3', score: '2-0' },
        { participant1Id: 'team_2', participant2Id: 'team_3', winnerId: 'team_2', score: '2-0' }
      ]

      const standings = calculateStandings(teams, matches)
      // All have 1 win, 2 sets. Head-to-head: team_1 beat team_2
      expect(standings[0].participantId).toBe('team_1')
      expect(standings[1].participantId).toBe('team_2')
    })

    it('should rank all participants correctly', () => {
      const teams = [
        { id: 'team_1' },
        { id: 'team_2' },
        { id: 'team_3' }
      ]
      
      const matches = [
        { participant1Id: 'team_1', participant2Id: 'team_2', winnerId: 'team_1', score: '2-0' },
        { participant1Id: 'team_1', participant2Id: 'team_3', winnerId: 'team_1', score: '2-0' },
        { participant1Id: 'team_2', participant2Id: 'team_3', winnerId: 'team_2', score: '2-0' }
      ]

      const standings = calculateStandings(teams, matches)
      expect(standings[0].rank).toBe(1)
      expect(standings[1].rank).toBe(2)
      expect(standings[2].rank).toBe(3)
    })
  })
})
```

**Acceptance Criteria:**
- ✅ Generic participant tests written (teams and players)
- ✅ Tiebreaker logic tested
- ✅ Head-to-head tested
- ✅ Ranking tested
- ✅ 15+ test cases
- ✅ Tests are RED until implementation

---

### Phase 3.GREEN: Implement Generic Standings

### Task 3.1: Refactor calculateStandings() for Generic Participants

**File:** `packages/core-logic/src/standings.ts` (modify existing)

**Current code:**
```typescript
export interface Match {
  player1Id: string
  player2Id: string
  winnerId: string | null
  score: string | null
}

export function calculateStandings(players: Player[], matches: Match[]): Standing[]
```

**Refactored code:**
```typescript
export interface Participant {
  id: string
  name?: string
}

export interface Match {
  participant1Id: string  // Can be playerId or teamId
  participant2Id: string  // Can be playerId or teamId
  winnerId: string | null
  score: string | null
}

export interface Standing {
  participantId: string   // Can be playerId or teamId
  rank: number
  wins: number
  losses: number
  setsWon: number
  setsLost: number
}

export function calculateStandings(
  participants: Participant[],
  matches: Match[]
): Standing[] {
  const stats = new Map<string, StandingStats>()

  // Initialize stats for all participants (works for any ID)
  participants.forEach(participant => {
    stats.set(participant.id, {
      wins: 0,
      losses: 0,
      setsWon: 0,
      setsLost: 0,
      headToHead: new Map(),
    })
  })

  // Process matches (algorithm unchanged)
  matches.forEach(match => {
    const participant1Stats = stats.get(match.participant1Id)
    const participant2Stats = stats.get(match.participant2Id)

    if (!participant1Stats || !participant2Stats) return
    if (!match.winnerId) return

    const sets = match.score ? parseSets(match.score) : { setsWon: 1, setsLost: 0 }

    if (match.winnerId === match.participant1Id) {
      participant1Stats.wins++
      participant2Stats.losses++
      // ... rest of logic identical
    } else {
      participant2Stats.wins++
      participant1Stats.losses++
      // ... rest of logic identical
    }
  })

  // Convert to standings and rank (algorithm identical)
  const standings: Standing[] = participants.map(participant => ({
    participantId: participant.id,
    rank: 0,
    wins: stats.get(participant.id)!.wins,
    losses: stats.get(participant.id)!.losses,
    setsWon: stats.get(participant.id)!.setsWon,
    setsLost: stats.get(participant.id)!.setsLost,
  }))

  // Sort by tiebreakers (unchanged)
  standings.sort((a, b) => {
    if (a.wins !== b.wins) return b.wins - a.wins
    if (a.setsWon !== b.setsWon) return b.setsWon - a.setsWon
    // Head-to-head...
    return Math.random() - 0.5
  })

  standings.forEach((standing, index) => {
    standing.rank = index + 1
  })

  return standings
}
```

**Acceptance Criteria:**
- ✅ Function accepts generic Participant type
- ✅ Match uses participant1Id/participant2Id
- ✅ Algorithm unchanged (same tiebreaker logic)
- ✅ All existing tests pass with new names
- ✅ Works with both playerIds and teamIds

**Test Approach:**
```typescript
// Existing test continues to work
const players = [{ id: 'p1' }, { id: 'p2' }]
const matches = [{ participant1Id: 'p1', participant2Id: 'p2', winnerId: 'p1', score: '2-1' }]
const standings = calculateStandings(players, matches)
expect(standings[0].participantId).toBe('p1')
```

---

### Task 3.2: Update Standings Processor

**File:** `packages/api/src/workers/standings-processor.ts` (modify existing)

**Change:**
```typescript
async function recalculateGroupStandings(groupId: string, tournamentId: string) {
  // Get all participants (players OR teams based on match format)
  const participants = await getGroupParticipants(groupId)
  const matches = await getGroupMatches(groupId)
  
  // Same calculation, works for both
  const standings = calculateStandings(participants, matches)
  
  // Update group_standings with either playerId or teamId
  for (const standing of standings) {
    await updateGroupStanding(groupId, standing.participantId, standing)
  }
}

async function getGroupParticipants(groupId: string): Promise<Participant[]> {
  // Check if this is a singles or doubles group
  const matches = await getGroupMatches(groupId)
  
  if (matches[0]?.team1_id) {
    // Doubles: return teams
    return getTeamsInGroup(groupId)
  } else {
    // Singles: return players
    return getPlayersInGroup(groupId)
  }
}
```

**Acceptance Criteria:**
- ✅ Processor works with any participant type
- ✅ Correctly detects singles vs doubles
- ✅ Updates standings with correct participant ID
- ✅ Maintains backwards compatibility
- ✅ **All tests from Phase 3.0 pass GREEN**

---

### Phase 3.REFACTOR: Refactor While Maintaining Test Pass

**Task 3.3: Refactor Standings Calculation**

**Scope:** While all tests pass, optimize standings logic

```typescript
// Review these aspects for refactoring:
// 1. Extract tiebreaker logic to separate function
// 2. Simplify participant stats initialization
// 3. Add meaningful comments only where algorithm is non-obvious
// 4. Consider caching tiebreaker results
```

**Acceptance Criteria:**
- ✅ Code more readable and maintainable
- ✅ All tests from Phase 3.0 still pass
- ✅ No logic changes
- ✅ Tiebreaker logic clearly separated
- ✅ No performance regressions

**Verification:**
```bash
npm test -- packages/core-logic/src/__tests__/standings.spec.ts
# All tests should PASS
```

---

## Phase 4: API Routes & Validation

**Duration:** 1.25 days (reduced from 1.75 due to TDD efficiency)  
**Risk Level:** Medium (validates user input)  
**Rollback:** Revert route changes

**TDD Approach:** RED-GREEN-REFACTOR cycle

---

### Phase 4.RED: Write Tests for API Routes

**Task 4.0.1: Write Tests - Match Type Detection & Doubles Validation**

**File:** `packages/api/src/__tests__/utils/match-utils.spec.ts` (new file)

**Test Structure:**

```typescript
describe('Match Utils (RED)', () => {
  describe('getMatchType', () => {
    it('should identify singles matches', () => {
      const match = {
        player1_id: 'p1',
        player2_id: 'p2',
        team1_id: null,
        team2_id: null
      }
      expect(getMatchType(match)).toBe('singles')
    })

    it('should identify doubles matches', () => {
      const match = {
        player1_id: null,
        player2_id: null,
        team1_id: 'team_1',
        team2_id: 'team_2'
      }
      expect(getMatchType(match)).toBe('doubles')
    })

    it('should return unknown for mixed match', () => {
      const match = {
        player1_id: 'p1',
        player2_id: null,
        team1_id: 'team_1',
        team2_id: null
      }
      expect(getMatchType(match)).toBe('unknown')
    })
  })

  describe('getMatchParticipantIds', () => {
    it('should return player IDs for singles', () => {
      const match = {
        player1_id: 'p1',
        player2_id: 'p2',
        team1_id: null,
        team2_id: null
      }
      expect(getMatchParticipantIds(match)).toEqual(['p1', 'p2'])
    })

    it('should return team IDs for doubles', () => {
      const match = {
        player1_id: null,
        player2_id: null,
        team1_id: 'team_1',
        team2_id: 'team_2'
      }
      expect(getMatchParticipantIds(match)).toEqual(['team_1', 'team_2'])
    })
  })
})
```

**Acceptance Criteria:**
- ✅ Match type detection tests written
- ✅ Edge cases covered
- ✅ 10+ test cases
- ✅ Tests are RED until implementation

---

**Task 4.0.2: Write Tests - Score Submission Validation**

**File:** `packages/api/src/__tests__/integration/doubles-score-submission.spec.ts` (new file)

**Test Structure:**

```typescript
describe('Doubles: Score Submission (RED)', () => {
  it('should allow team1.player1 to submit score', async () => {
    const match = await setupDoublesMatch()
    
    const response = await post(
      `/tournaments/${match.tournamentId}/matches/${match.id}/score`,
      { score: '2-1' },
      { auth: match.team1.player1 }
    )
    
    expect(response.status).toBe(202)
  })

  it('should allow team1.player2 to submit score', async () => {
    const match = await setupDoublesMatch()
    
    const response = await post(
      `/tournaments/${match.tournamentId}/matches/${match.id}/score`,
      { score: '2-1' },
      { auth: match.team1.player2 }
    )
    
    expect(response.status).toBe(202)
  })

  it('should allow team2.player1 to submit score', async () => {
    const match = await setupDoublesMatch()
    
    const response = await post(
      `/tournaments/${match.tournamentId}/matches/${match.id}/score`,
      { score: '2-1' },
      { auth: match.team2.player1 }
    )
    
    expect(response.status).toBe(202)
  })

  it('should allow team2.player2 to submit score', async () => {
    const match = await setupDoublesMatch()
    
    const response = await post(
      `/tournaments/${match.tournamentId}/matches/${match.id}/score`,
      { score: '1-2' },
      { auth: match.team2.player2 }
    )
    
    expect(response.status).toBe(202)
  })

  it('should reject unrelated player', async () => {
    const match = await setupDoublesMatch()
    const unrelated = await createPlayer('unrelated@test.com')
    
    const response = await post(
      `/tournaments/${match.tournamentId}/matches/${match.id}/score`,
      { score: '2-1' },
      { auth: unrelated }
    )
    
    expect(response.status).toBe(403)
    expect(response.body.message).toContain('not in this match')
  })

  it('should log score.submitted at INFO level', async () => {
    const match = await setupDoublesMatch()
    
    await post(
      `/tournaments/${match.tournamentId}/matches/${match.id}/score`,
      { score: '2-1' },
      { auth: match.team1.player1 }
    )
    
    const logs = await getLogs()
    expect(logs).toContainEqual(
      expect.objectContaining({
        level: 'info',
        event: 'score.submitted',
        playerId: match.team1.player1.id,
        matchId: match.id,
        tournamentId: match.tournamentId,
        score: '2-1'
      })
    )
  })

  it('should update standings after score submission', async () => {
    const match = await setupDoublesMatch()
    
    await post(
      `/tournaments/${match.tournamentId}/matches/${match.id}/score`,
      { score: '2-1' },
      { auth: match.team1.player1 }
    )
    
    const standings = await getGroupStandings(match.groupId)
    expect(standings[0].participantId).toBe(match.team1.id)
    expect(standings[0].wins).toBe(1)
  })
})
```

**Acceptance Criteria:**
- ✅ Score submission validation tests written
- ✅ All team member scenarios tested
- ✅ Unrelated player rejection tested
- ✅ Logging tested
- ✅ Standings update tested
- ✅ 15+ test cases
- ✅ Tests are RED until implementation

---

**Task 4.0.3: Write Tests - Match Details & Standings Endpoints**

**File:** `packages/api/src/__tests__/integration/doubles-api-endpoints.spec.ts` (new file)

**Test Structure:**

```typescript
describe('Doubles: API Endpoints (RED)', () => {
  describe('GET /matches/:matchId', () => {
    it('should return singles match with player details', async () => {
      const tournament = await createTournament({ matchFormat: 'singles' })
      const match = await setupSinglesMatch(tournament.id)
      
      const response = await get(`/tournaments/${tournament.id}/matches/${match.id}`)
      
      expect(response.body.matchType).toBe('singles')
      expect(response.body.participants[0].playerId).toBeDefined()
      expect(response.body.participants[1].playerId).toBeDefined()
    })

    it('should return doubles match with team details', async () => {
      const tournament = await createTournament({ matchFormat: 'doubles' })
      const match = await setupDoublesMatch(tournament.id)
      
      const response = await get(`/tournaments/${tournament.id}/matches/${match.id}`)
      
      expect(response.body.matchType).toBe('doubles')
      expect(response.body.participants[0].teamId).toBeDefined()
      expect(response.body.participants[0].players).toHaveLength(2)
      expect(response.body.participants[1].teamId).toBeDefined()
      expect(response.body.participants[1].players).toHaveLength(2)
    })
  })

  describe('GET /standings', () => {
    it('should return singles standings with player info', async () => {
      const tournament = await createTournament({ matchFormat: 'singles' })
      const standings = await getStandings(tournament.groupId)
      
      expect(standings[0].playerId).toBeDefined()
      expect(standings[0].name).toBeDefined()
    })

    it('should return doubles standings with team info', async () => {
      const tournament = await createTournament({ matchFormat: 'doubles' })
      const standings = await getStandings(tournament.groupId)
      
      expect(standings[0].teamId).toBeDefined()
      expect(standings[0].teamName).toBeDefined()
      expect(standings[0].players).toHaveLength(2)
      expect(standings[0].players[0].id).toBeDefined()
      expect(standings[0].players[0].name).toBeDefined()
    })
  })
})
```

**Acceptance Criteria:**
- ✅ Endpoint response format tests written
- ✅ Both singles and doubles tested
- ✅ Detail object structure verified
- ✅ 10+ test cases
- ✅ Tests are RED until implementation

---

### Phase 4.GREEN: Implement API Routes

### Task 4.1a: Add Match Type Detection

**File:** `packages/api/src/utils/match-utils.ts` (new file)

**Implementation:** Helper to detect singles vs doubles matches

```typescript
export function getMatchType(match: any): 'singles' | 'doubles' | 'unknown' {
  // Check if player columns populated (singles)
  if (match.player1_id !== null && match.player2_id !== null) {
    return 'singles'
  }
  
  // Check if team columns populated (doubles)
  if (match.team1_id !== null && match.team2_id !== null) {
    return 'doubles'
  }
  
  return 'unknown'
}

export function getMatchParticipantIds(match: any): string[] {
  const type = getMatchType(match)
  
  if (type === 'singles') {
    return [match.player1_id, match.player2_id]
  } else if (type === 'doubles') {
    return [match.team1_id, match.team2_id]
  }
  
  return []
}
```

**Acceptance Criteria:**
- ✅ Detect singles matches (player1_id, player2_id populated)
- ✅ Detect doubles matches (team1_id, team2_id populated)
- ✅ Return correct match type
- ✅ Handle edge cases (no participants)
- ✅ Exported for reuse across routes

---

### Task 4.1b: Add Doubles Participant Validation

**File:** `packages/api/src/routes/tournaments.ts` (new helper)

**Implementation:** Check if player is in doubles match

```typescript
async function canPlayerSubmitDoublesScore(
  match: any,
  playerId: string,
  teamRepo: TeamRepository
): Promise<{ allowed: boolean; error?: string }> {
  try {
    const team1 = await teamRepo.findTeamById(match.team1_id)
    const team2 = await teamRepo.findTeamById(match.team2_id)

    if (!team1 || !team2) {
      return { allowed: false, error: 'Match teams not found' }
    }

    // Check if player is on team1
    if (team1.player1_id === playerId || team1.player2_id === playerId) {
      return { allowed: true }
    }

    // Check if player is on team2
    if (team2.player1_id === playerId || team2.player2_id === playerId) {
      return { allowed: true }
    }

    return { allowed: false, error: 'You are not in this match' }
  } catch (err) {
    return { allowed: false, error: 'Error validating match participation' }
  }
}
```

**Acceptance Criteria:**
- ✅ Query both teams from database
- ✅ Check all 4 team members against playerId
- ✅ Return true if player in either team
- ✅ Return false with error message if not
- ✅ Handle missing team records gracefully

---

### Task 4.1c: Update Score Submission Endpoint

**File:** `packages/api/src/routes/tournaments.ts` (modify existing)

**Implementation:** Use new helpers for validation

```typescript
router.post('/:tournamentId/matches/:matchId/score', async (req, res, next) => {
  const payload = await requirePlayerSessionAuth(req.headers.authorization, deps.tokenStore)
  const match = await getGroupMatch(req.params.matchId)
  
  if (!match) {
    return res.status(404).json({ code: 'NOT_FOUND' })
  }
  
  // Determine match type and validate
  const matchType = getMatchType(match)
  let canSubmit = false
  let errorMessage = 'You are not in this match'

  if (matchType === 'singles') {
    canSubmit = match.player1_id === payload.playerId || match.player2_id === payload.playerId
  } else if (matchType === 'doubles') {
    const validation = await canPlayerSubmitDoublesScore(match, payload.playerId, teamRepo)
    canSubmit = validation.allowed
    errorMessage = validation.error || errorMessage
  } else {
    return res.status(400).json({ code: 'INVALID_MATCH', message: 'Match type unknown' })
  }

  if (!canSubmit) {
    return res.status(403).json({ code: 'FORBIDDEN', message: errorMessage })
  }
  
  // Rest of score submission logic unchanged
  const score = parseScore(req.body.score)
  // ... validation, db update, job queue, etc.
})
```

**Acceptance Criteria:**
- ✅ Import getMatchType helper
- ✅ Call getMatchType on match
- ✅ Use direct check for singles
- ✅ Use helper for doubles validation
- ✅ Return appropriate error messages
- ✅ All existing logic continues unchanged
- ✅ **Structured logging at INFO level:**
  - Log `score.submitted` immediately before success response
  - Include: `playerId` (or both team members for doubles), `matchId`, `tournamentId`, `score`, `groupId`
  - Use module-level logger: `const log = getLogger('tournaments')`
  - Never include: full request body, sensitive player info beyond IDs
  - Note: Existing score submission logging should already be in place; ensure doubles adds actor identification

**Test Cases:**
```typescript
// Singles: player1 can submit ✅
// Singles: player2 can submit ✅
// Singles: player3 cannot submit (403) ✅
// Doubles: team1.player1 can submit ✅
// Doubles: team1.player2 can submit
// Doubles: team2.player1 can submit
// Doubles: team2.player2 can submit
// Doubles: unregistered player cannot submit (403)
```

---

### Task 4.2: Match Details Endpoint

**File:** `packages/api/src/routes/tournaments.ts` (modify GET match details)

**Current code location:** Search for `GET /tournaments/:tournamentId/matches/:matchId`

**Refactoring:**

```typescript
router.get('/:tournamentId/matches/:matchId', async (req, res, next) => {
  const match = await getGroupMatch(req.params.matchId)
  
  if (match.player1_id) {
    // Singles match
    const player1 = await getPlayer(match.player1_id)
    const player2 = await getPlayer(match.player2_id)
    
    return res.json({
      id: match.id,
      matchType: 'singles',
      participants: [
        { playerId: player1.id, name: player1.name },
        { playerId: player2.id, name: player2.name }
      ],
      score: match.score,
      winner: match.winner_id ? { playerId: match.winner_id } : null
    })
  } else {
    // Doubles match
    const team1 = await getTeamById(match.team1_id)
    const team2 = await getTeamById(match.team2_id)
    const p1_1 = await getPlayer(team1.player1_id)
    const p1_2 = await getPlayer(team1.player2_id)
    const p2_1 = await getPlayer(team2.player1_id)
    const p2_2 = await getPlayer(team2.player2_id)
    
    return res.json({
      id: match.id,
      matchType: 'doubles',
      participants: [
        {
          teamId: team1.id,
          players: [
            { playerId: p1_1.id, name: p1_1.name },
            { playerId: p1_2.id, name: p1_2.name }
          ]
        },
        {
          teamId: team2.id,
          players: [
            { playerId: p2_1.id, name: p2_1.name },
            { playerId: p2_2.id, name: p2_2.name }
          ]
        }
      ],
      score: match.score,
      winner: match.winner_id ? { teamId: match.winner_id } : null
    })
  }
})
```

**Acceptance Criteria:**
- ✅ Singles response includes player details
- ✅ Doubles response includes team + player details
- ✅ Schema clearly indicates match type
- ✅ Frontend can render either format

---

### Task 4.3: Standings Endpoint

**File:** `packages/api/src/routes/tournaments.ts` (modify GET standings)

**Refactoring:**

```typescript
router.get('/:tournamentId/standings', async (req, res, next) => {
  const groupId = req.query.groupId as string
  const standings = await getGroupStandings(groupId)
  const tournament = await getTournament(standings[0].tournamentId)
  
  if (tournament.match_format === 'doubles') {
    // Enrich standings with team player info
    const enriched = await Promise.all(
      standings.map(async (standing) => {
        const team = await getTeamById(standing.participantId)
        const p1 = await getPlayer(team.player1_id)
        const p2 = await getPlayer(team.player2_id)
        
        return {
          rank: standing.rank,
          teamId: standing.participantId,
          teamName: `${p1.name} & ${p2.name}`,
          players: [
            { id: p1.id, name: p1.name },
            { id: p2.id, name: p2.name }
          ],
          wins: standing.wins,
          losses: standing.losses,
          setsWon: standing.sets_won,
          setsLost: standing.sets_lost,
          differential: standing.sets_won - standing.sets_lost
        }
      })
    )
    return res.json({ standings: enriched, matchFormat: 'doubles' })
  } else {
    // Singles standings
    const enriched = standings.map(standing => ({
      rank: standing.rank,
      playerId: standing.participantId,
      name: standing.player_name,
      wins: standing.wins,
      losses: standing.losses,
      setsWon: standing.sets_won,
      setsLost: standing.sets_lost,
      differential: standing.sets_won - standing.sets_lost
    }))
    return res.json({ standings: enriched, matchFormat: 'singles' })
  }
})
```

**Acceptance Criteria:**
- ✅ Singles standings show individual player info
- ✅ Doubles standings show team names + both players
- ✅ Differential calculated correctly for both
- ✅ Ranking unchanged (only display changes)
- ✅ **All tests from Phase 4.0 pass GREEN**

---

### Phase 4.REFACTOR: Refactor While Maintaining Test Pass

**Task 4.4: Refactor API Routes**

**Scope:** While all tests pass, optimize endpoint logic

```typescript
// Review these aspects for refactoring:
// 1. Consolidate singles/doubles logic where possible
// 2. Extract response formatting to helper functions
// 3. Simplify validation chain
// 4. Add meaningful comments only where logic flow is non-obvious
```

**Acceptance Criteria:**
- ✅ Code more readable and maintainable
- ✅ All tests from Phase 4.0 still pass
- ✅ No logic changes
- ✅ Response formatting cleaner
- ✅ No performance regressions

**Verification:**
```bash
npm test -- packages/api/src/__tests__/integration/doubles-score-submission.spec.ts
npm test -- packages/api/src/__tests__/integration/doubles-api-endpoints.spec.ts
# All tests should PASS
```

---

## Phase 5: Frontend Display

**Duration:** 3 days (reduced from 4.2 due to TDD efficiency)  
**Risk Level:** Low (UI only, no logic changes)  
**Rollback:** Revert component changes

**TDD Approach:** RED-GREEN-REFACTOR cycle with component & E2E tests

---

### Phase 5.RED: Write Component & E2E Tests

**Task 5.0.1: Write E2E Tests - Doubles Tournament Flow**

**File:** `packages/frontend/src/__tests__/doubles-tournament-flow.e2e.spec.ts` (new file)

**Test Structure (Playwright/Cypress):**

```typescript
describe('Doubles: E2E Tournament Flow (RED)', () => {
  it('should complete doubles tournament from registration to standings', async () => {
    // 1. Create tournament with matchFormat='doubles'
    const tournament = await createTournament({
      name: 'Spring Doubles Cup',
      matchFormat: 'doubles'
    })

    // 2. Navigate to tournament browse
    await page.goto('/tournaments')
    
    // Should show doubles badge
    await expect(page.locator('[data-testid="format-badge"]')).toContainText('👥 Doubles')

    // 3. Register alice with partner bob
    await page.click('[data-testid="register-button"]')
    await page.fill('[name="email"]', 'alice@test.com')
    await page.fill('[name="name"]', 'Alice')
    
    // Select "invite" option
    await page.click('input[value="invite"]')
    await page.fill('[name="partnerEmail"]', 'bob@test.com')
    await page.click('[type="submit"]')
    
    // Should show confirmation message
    await expect(page).toContainText('Registration successful')

    // 4. Verify tournament detail shows teams
    await page.goto(`/tournaments/${tournament.id}`)
    await expect(page).toContainText('Registered Teams')
    await expect(page).toContainText('Alice')

    // 5. Advance to group stage
    await advanceTournament(tournament.id, 'to_group_stage')
    
    // 6. Verify standings shows team names
    await page.goto(`/tournaments/${tournament.id}/standings`)
    
    // Should see table with team names
    const standingsTable = page.locator('[role="table"]')
    await expect(standingsTable).toContainText('Alice & Bob')

    // 7. Submit a score
    const match = await getFirstMatch(tournament.id)
    await page.goto(`/matches/${match.id}`)
    
    // Should show team compositions
    await expect(page).toContainText('Team 1')
    await expect(page).toContainText('Team 2')
    
    // Fill and submit score
    await page.fill('[name="score"]', '2-1')
    await page.click('[type="submit"]')
    
    await expect(page).toContainText('Score submitted')

    // 8. Verify standings updated
    const standings = page.locator('[data-testid="standings-table"]')
    await expect(standings).toContainText('1 win')
  })
})
```

**Acceptance Criteria:**
- ✅ Full E2E flow tested
- ✅ Team names display correctly
- ✅ Real-time updates verified
- ✅ Score submission works
- ✅ 5+ E2E test scenarios
- ✅ Tests are RED until implementation

---

**Task 5.0.2: Write Component Tests - Standings & Match Display**

**File:** `packages/frontend/src/__tests__/components/StandingsTable.spec.tsx` (new file)

**Test Structure (React Testing Library):**

```typescript
describe('StandingsTable Component (RED)', () => {
  it('should render singles standings', () => {
    const standings = [
      { playerId: 'p1', name: 'Alice', rank: 1, wins: 2, losses: 0 },
      { playerId: 'p2', name: 'Bob', rank: 2, wins: 1, losses: 1 }
    ]
    
    const { getByText } = render(<StandingsTable standings={standings} />)
    
    expect(getByText('Alice')).toBeInTheDocument()
    expect(getByText('Bob')).toBeInTheDocument()
    expect(getByText('Player')).toBeInTheDocument() // Header
  })

  it('should render doubles standings with team names', () => {
    const standings = [
      {
        teamId: 'team_1',
        teamName: 'Alice & Bob',
        players: [
          { id: 'p1', name: 'Alice' },
          { id: 'p2', name: 'Bob' }
        ],
        rank: 1,
        wins: 2,
        losses: 0
      }
    ]
    
    const { getByText } = render(<StandingsTable standings={standings} />)
    
    expect(getByText('Alice & Bob')).toBeInTheDocument()
    expect(getByText('Team')).toBeInTheDocument() // Header
  })

  it('should display set differential', () => {
    const standings = [
      {
        teamId: 'team_1',
        teamName: 'Alice & Bob',
        players: [{ id: 'p1', name: 'Alice' }, { id: 'p2', name: 'Bob' }],
        rank: 1,
        wins: 2,
        setsWon: 5,
        setsLost: 2,
        differential: 3
      }
    ]
    
    const { getByText } = render(<StandingsTable standings={standings} />)
    expect(getByText('+3')).toBeInTheDocument()
  })

  it('should be responsive on mobile', () => {
    const standings = [
      {
        teamId: 'team_1',
        teamName: 'Alice & Bob',
        players: [{ id: 'p1', name: 'Alice' }, { id: 'p2', name: 'Bob' }],
        rank: 1,
        wins: 2,
        losses: 0
      }
    ]
    
    window.innerWidth = 320
    const { getByText } = render(<StandingsTable standings={standings} />)
    
    // Should still display team name without horizontal scroll
    expect(getByText('Alice & Bob')).toBeVisible()
  })
})
```

**Acceptance Criteria:**
- ✅ Component rendering tests written
- ✅ Singles and doubles variants tested
- ✅ Responsive behavior tested
- ✅ 20+ test cases
- ✅ Tests are RED until implementation

---

**Task 5.0.3: Write Component Tests - Partner Selection UI**

**File:** `packages/frontend/src/__tests__/components/PartnerSelection.spec.tsx` (new file)

**Test Structure:**

```typescript
describe('Partner Selection Components (RED)', () => {
  it('should render partner selection radio options', () => {
    const { getByLabelText } = render(
      <PartnerSelection
        partnerOption="select"
        onOptionChange={jest.fn()}
      />
    )
    
    expect(getByLabelText(/select from registered players/i)).toBeInTheDocument()
    expect(getByLabelText(/invite by email/i)).toBeInTheDocument()
  })

  it('should show partner dropdown when select option chosen', () => {
    const { getByText } = render(<PartnerDropdown tournamentId="t1" />)
    
    expect(getByText(/loading partners/i)).toBeInTheDocument()
  })

  it('should show invite input when invite option chosen', () => {
    const { getByPlaceholderText } = render(
      <PartnerInviteInput
        value=""
        onChange={jest.fn()}
      />
    )
    
    expect(getByPlaceholderText(/partner@example.com/i)).toBeInTheDocument()
  })

  it('should validate email format', () => {
    const { getByText } = render(
      <PartnerInviteInput
        value="invalid-email"
        onChange={jest.fn()}
      />
    )
    
    expect(getByText(/valid email/i)).toBeInTheDocument()
  })

  it('should handle form submission', () => {
    const onSubmit = jest.fn()
    const { getByRole } = render(
      <DoublesRegistrationForm tournament={{ id: 't1' }} onSuccess={onSubmit} />
    )
    
    // Fill form
    userEvent.type(getByRole('textbox', { name: /email/i }), 'alice@test.com')
    userEvent.click(getByRole('button', { name: /register/i }))
    
    // Should submit
    expect(onSubmit).toHaveBeenCalled()
  })
})
```

**Acceptance Criteria:**
- ✅ Component tests written for all partner selection UI
- ✅ Validation tested
- ✅ Form submission tested
- ✅ 15+ test cases
- ✅ Tests are RED until implementation

---

### Phase 5.GREEN: Implement Components

### Task 5.1: Update Standings Table Component

**File:** `packages/frontend/src/components/StandingsTable.tsx`

**Current implementation:**
```typescript
const standings = await getStandings(groupId)

return (
  <table>
    <thead>
      <tr>
        <th>Rank</th>
        <th>Name</th>
        <th>Wins</th>
        <th>Losses</th>
        <th>Sets W</th>
        <th>Sets L</th>
        <th>+/-</th>
      </tr>
    </thead>
    <tbody>
      {standings.map(s => (
        <tr key={s.playerId}>
          <td>{s.rank}</td>
          <td>{s.name}</td>
          <td>{s.wins}</td>
          {/* ... */}
        </tr>
      ))}
    </tbody>
  </table>
)
```

**Refactored implementation:**
```typescript
const standings = await getStandings(groupId)
const isSingles = standings[0]?.playerId !== undefined
const isDoubles = standings[0]?.teamId !== undefined

return (
  <table>
    <thead>
      <tr>
        <th>Rank</th>
        <th>{isSingles ? 'Player' : 'Team'}</th>
        <th>Wins</th>
        <th>Losses</th>
        <th>Sets W</th>
        <th>Sets L</th>
        <th>+/-</th>
      </tr>
    </thead>
    <tbody>
      {standings.map(s => (
        <tr key={isSingles ? s.playerId : s.teamId}>
          <td>{s.rank}</td>
          <td>
            {isSingles ? (
              <span>{s.name}</span>
            ) : (
              <div>
                <div className="font-semibold">{s.teamName}</div>
                <div className="text-sm text-gray-500">
                  {s.players.map(p => p.name).join(' & ')}
                </div>
              </div>
            )}
          </td>
          <td>{s.wins}</td>
          {/* ... rest of columns same */}
        </tr>
      ))}
    </tbody>
  </table>
)
```

**Acceptance Criteria:**
- ✅ Singles displays single player name
- ✅ Doubles displays "Player1 & Player2" as team name
- ✅ All statistics display correctly
- ✅ Responsive on mobile (no horizontal scroll)

---

### Task 5.2: Update Match Card Component

**File:** `packages/frontend/src/components/MatchCard.tsx`

**Current implementation:**
```typescript
return (
  <div className="match-card">
    <h3>{match.opponent.name}</h3>
    <p>{match.group} • {match.format}</p>
    <p className="score">{match.score || 'Pending'}</p>
  </div>
)
```

**Refactored implementation:**
```typescript
const isSingles = match.participants[0]?.playerId !== undefined
const isDoubles = match.participants[0]?.teamId !== undefined

return (
  <div className="match-card">
    <h3>
      {isSingles ? (
        // Singles: "You vs Alice"
        <>
          {match.yourTeam.name} vs {match.opponents[0].name}
        </>
      ) : (
        // Doubles: "You & Bob vs Alice & Charlie"
        <>
          <span className="text-sm text-gray-600">
            {match.yourTeam.players.map(p => p.name).join(' & ')}
          </span>
          <br />
          vs
          <br />
          <span className="text-sm text-gray-600">
            {match.opponents.map(p => p.name).join(' & ')}
          </span>
        </>
      )}
    </h3>
    <p>{match.group} • {match.format}</p>
    <p className="score">{match.score || 'Pending'}</p>
  </div>
)
```

**Acceptance Criteria:**
- ✅ Singles shows "You vs Opponent"
- ✅ Doubles shows both team compositions
- ✅ Mobile layout stacks properly
- ✅ Clearly indicates match type

---

### Task 5.3: Update Match Detail Page

**File:** `packages/frontend/src/pages/MatchDetail.tsx`

**Implementation:**
```typescript
const match = await getMatch(matchId)
const isSingles = match.matchType === 'singles'
const isDoubles = match.matchType === 'doubles'

return (
  <div>
    {isSingles ? (
      <div className="match-details-singles">
        <h2>
          {match.participants[0].name} vs {match.participants[1].name}
        </h2>
        <ScoreSubmitForm match={match} />
      </div>
    ) : (
      <div className="match-details-doubles">
        <h2>Doubles Match</h2>
        <div className="teams">
          <div className="team">
            <h3>Team 1</h3>
            {match.participants[0].players.map(p => (
              <p key={p.id}>{p.name}</p>
            ))}
          </div>
          <div>vs</div>
          <div className="team">
            <h3>Team 2</h3>
            {match.participants[1].players.map(p => (
              <p key={p.id}>{p.name}</p>
            ))}
          </div>
        </div>
        <ScoreSubmitForm match={match} />
      </div>
    )}
  </div>
)
```

**Acceptance Criteria:**
- ✅ Singles shows 1v1 layout
- ✅ Doubles shows team compositions side-by-side
- ✅ Score form works for both
- ✅ Mobile responsive

---

### Task 5.4: Update Bracket View Component

**File:** `packages/frontend/src/components/BracketView.tsx`

**Current implementation (singles):**
```typescript
const bracket = await getBracket(tournamentId)

return (
  <div className="bracket-tree">
    {bracket.map(round => (
      <div key={round} className="round">
        <h3>{round}</h3>
        {matches[round].map(match => (
          <div className="match-box" key={match.id}>
            <div className="player">{match.player1Name}</div>
            <div className="score">{match.score || 'vs'}</div>
            <div className="player">{match.player2Name}</div>
          </div>
        ))}
      </div>
    ))}
  </div>
)
```

**Refactored implementation (handles both):**
```typescript
const bracket = await getBracket(tournamentId)
const isSingles = bracket[0]?.player1Id !== undefined
const isDoubles = bracket[0]?.team1Id !== undefined

return (
  <div className="bracket-tree">
    {bracket.map(round => (
      <div key={round} className="round">
        <h3>{round}</h3>
        {matches[round].map(match => (
          <div className="match-box" key={match.id}>
            {isSingles ? (
              <>
                <div className="player">{match.player1Name}</div>
                <div className="score">{match.score || 'vs'}</div>
                <div className="player">{match.player2Name}</div>
              </>
            ) : (
              <>
                <div className="team">
                  <div className="team-name">{match.team1Name}</div>
                  <div className="players">
                    {match.team1Players.map(p => (
                      <div key={p.id} className="player-name">{p.name}</div>
                    ))}
                  </div>
                </div>
                <div className="score">{match.score || 'vs'}</div>
                <div className="team">
                  <div className="team-name">{match.team2Name}</div>
                  <div className="players">
                    {match.team2Players.map(p => (
                      <div key={p.id} className="player-name">{p.name}</div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    ))}
  </div>
)
```

**Styling Considerations:**
```css
.match-box {
  /* Existing singles styles */
}

.match-box .team {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.match-box .team-name {
  font-weight: 600;
  font-size: 0.875rem;
}

.match-box .players {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 0.75rem;
  color: #666;
}

.match-box .player-name {
  margin-left: 4px;
}
```

**Acceptance Criteria:**
- ✅ Singles shows player names in bracket
- ✅ Doubles shows "Team Name" with player list below
- ✅ Team compositions clearly visible
- ✅ Mobile layout stacks properly (no horizontal overflow)
- ✅ Responsive at all breakpoints (320px-1440px)

---

### Task 5.5: Update Tournament Browse Page

**File:** `packages/frontend/src/pages/Browse.tsx`

**Current implementation:**
```typescript
const tournaments = await getTournaments()

return (
  <div className="tournament-list">
    {tournaments.map(t => (
      <div className="tournament-card" key={t.id}>
        <h3>{t.name}</h3>
        <p>Sport: {t.sport}</p>
        <p>Format: {t.format}</p>
        <p>Players: {t.registeredCount}/{t.maxPlayers}</p>
        <button>View Details</button>
      </div>
    ))}
  </div>
)
```

**Refactored implementation:**
```typescript
const tournaments = await getTournaments()

return (
  <div className="tournament-list">
    {tournaments.map(t => (
      <div className="tournament-card" key={t.id}>
        <div className="card-header">
          <h3>{t.name}</h3>
          <div className="badges">
            <span className={`format-badge ${t.format}`}>
              {t.format === 'doubles' ? '👥 Doubles' : '👤 Singles'}
            </span>
            <span className="sport-badge">{t.sport}</span>
          </div>
        </div>
        
        <div className="card-body">
          <div className="stat">
            <label>Registration</label>
            <p>
              {t.registeredCount}/{t.maxPlayers} {t.format === 'doubles' ? 'teams' : 'players'}
            </p>
          </div>
          
          <div className="stat">
            <label>Deadline</label>
            <p>{formatDate(t.registrationDeadline)}</p>
          </div>
          
          <div className="stat">
            <label>Status</label>
            <p className={`status status-${t.status}`}>{t.status}</p>
          </div>
        </div>
        
        <button className="view-btn">View Details</button>
      </div>
    ))}
  </div>
)
```

**Styling Additions:**
```css
.format-badge {
  display: inline-block;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 0.75rem;
  font-weight: 600;
}

.format-badge.doubles {
  background-color: #e0f2fe;
  color: #0369a1;
}

.format-badge.singles {
  background-color: #fef3c7;
  color: #92400e;
}
```

**Acceptance Criteria:**
- ✅ Clear visual distinction between singles and doubles
- ✅ Badge shows match format
- ✅ Participant count shows "teams" for doubles, "players" for singles
- ✅ All tournament information visible
- ✅ Mobile responsive (single column)
- ✅ Desktop responsive (grid layout)

---

### Task 5.6a: Add Participant List Section

**File:** `packages/frontend/src/pages/TournamentDetail.tsx`

**Implementation:** Add participants section to tournament detail

```typescript
const TournamentDetail = () => {
  const [tournament, setTournament] = useState<Tournament | null>(null)
  const [participants, setParticipants] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadTournamentAndParticipants()
  }, [tournamentId])

  const loadTournamentAndParticipants = async () => {
    const t = await getTournament(tournamentId)
    const p = await getParticipants(tournamentId)
    setTournament(t)
    setParticipants(p)
    setLoading(false)
  }

  if (loading) return <div>Loading...</div>

  return (
    <div className="tournament-detail">
      {/* ... existing sections (status, deadline, etc.) ... */}
      
      <section className="participants-section">
        <h2>
          Registered {tournament.matchFormat === 'doubles' ? 'Teams' : 'Players'}
          <span className="count">
            {participants.length}/{tournament.maxPlayers}
          </span>
        </h2>

        {tournament.matchFormat === 'doubles' ? (
          <ParticipantListDoubles participants={participants} />
        ) : (
          <ParticipantListSingles participants={participants} />
        )}
      </section>
    </div>
  )
}
```

**Acceptance Criteria:**
- ✅ Fetch tournament and participants on mount
- ✅ Show loading state while fetching
- ✅ Display correct participant count
- ✅ Show "Players" vs "Teams" based on format
- ✅ Route to correct component based on format

---

### Task 5.6b: Create Team Participant Component

**File:** `packages/frontend/src/components/ParticipantListDoubles.tsx` (new file)

**Implementation:** Display team registrations with confirmation

```typescript
export function ParticipantListDoubles({ participants }: { participants: any[] }) {
  return (
    <div className="team-list">
      {participants.map(team => (
        <div key={team.id} className="team-item">
          <div className="team-header">
            <h3 className="team-name">
              {team.player1Name} & {team.player2Name}
            </h3>
            <span className={`status status-${team.status}`}>
              {getStatusLabel(team.status)}
            </span>
          </div>

          <div className="team-members">
            <MemberRow
              name={team.player1Name}
              email={team.player1Email}
              confirmed={team.player1Confirmed}
            />
            <MemberRow
              name={team.player2Name}
              email={team.player2Email}
              confirmed={team.player2Confirmed}
            />
          </div>
        </div>
      ))}
    </div>
  )
}

function MemberRow({
  name,
  email,
  confirmed
}: {
  name: string
  email: string
  confirmed: boolean
}) {
  return (
    <div className="member-row">
      <div>
        <div className="member-name">{name}</div>
        <div className="member-email">{email}</div>
      </div>
      <span className={`confirmation-badge ${confirmed ? 'confirmed' : 'pending'}`}>
        {confirmed ? '✓ Confirmed' : '⏳ Pending'}
      </span>
    </div>
  )
}
```

**Styling:**
```css
.team-item {
  border: 1px solid #e5e7eb;
  border-left: 4px solid #0ea5e9;
  border-radius: 6px;
  padding: 12px;
  margin-bottom: 12px;
}

.team-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.team-name {
  font-weight: 600;
  font-size: 1rem;
  margin: 0;
  color: #1f2937;
}

.team-members {
  display: flex;
  flex-direction: column;
  gap: 8px;
  background: #f9fafb;
  padding: 8px;
  border-radius: 4px;
}

.member-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.875rem;
}

.member-name {
  font-weight: 500;
  color: #374151;
}

.member-email {
  font-size: 0.75rem;
  color: #9ca3af;
}

.confirmation-badge {
  padding: 2px 8px;
  border-radius: 3px;
  font-size: 0.75rem;
  font-weight: 500;
}

.confirmation-badge.confirmed {
  background-color: #dcfce7;
  color: #166534;
}

.confirmation-badge.pending {
  background-color: #fef3c7;
  color: #92400e;
}
```

**Acceptance Criteria:**
- ✅ Display team name from both players
- ✅ Show both players in team
- ✅ Display confirmation status per player
- ✅ Show team registration status
- ✅ Styling matches design system
- ✅ Mobile responsive

---

### Task 5.6c: Create Singles Participant Component

**File:** `packages/frontend/src/components/ParticipantListSingles.tsx` (new file)

**Implementation:** Display single player registrations

```typescript
export function ParticipantListSingles({ participants }: { participants: any[] }) {
  return (
    <div className="player-list">
      {participants.map(player => (
        <div key={player.id} className="player-item">
          <div className="player-info">
            <div className="player-name">{player.name}</div>
            <div className="player-email">{player.email}</div>
          </div>
          <span className={`status status-${player.status}`}>
            {getStatusLabel(player.status)}
          </span>
        </div>
      ))}
    </div>
  )
}
```

**Styling:**
```css
.player-item {
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  padding: 12px;
  margin-bottom: 8px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.player-name {
  font-weight: 500;
  color: #374151;
}

.player-email {
  font-size: 0.75rem;
  color: #9ca3af;
}
```

**Acceptance Criteria:**
- ✅ Display player name and email
- ✅ Show registration status
- ✅ Reuse existing button/badge styles
- ✅ Mobile responsive

---

### Task 5.7: Update Score Submission Form

**File:** `packages/frontend/src/components/ScoreSubmitForm.tsx`

**Current form (works for both, minor styling updates):**
```typescript
// Form itself needs no logic changes - API accepts any participant ID
// But labeling should reflect singles vs doubles

const [score, setScore] = useState('')
const match = props.match
const isSingles = match.matchType === 'singles'
const isDoubles = match.matchType === 'doubles'

return (
  <form onSubmit={handleSubmit}>
    <div className="form-header">
      {isSingles ? (
        <h3>Submit Score</h3>
      ) : (
        <h3>
          <div>Submit Score</div>
          <div className="teams-info">
            {match.team1Name} vs {match.team2Name}
          </div>
        </h3>
      )}
    </div>
    
    <div className="form-body">
      <div className="score-input">
        <label>
          {isSingles ? 'Your Sets' : `${match.team1Name} Sets`}
        </label>
        <input type="number" min="0" max="3" />
      </div>
      
      <div className="score-input">
        <label>
          {isSingles ? 'Opponent Sets' : `${match.team2Name} Sets`}
        </label>
        <input type="number" min="0" max="3" />
      </div>
    </div>
    
    <div className="validation">
      {isSingles ? (
        <p className="hint">Format: X-Y (you won X sets, opponent won Y)</p>
      ) : (
        <p className="hint">Format: X-Y ({match.team1Name} won X sets, {match.team2Name} won Y)</p>
      )}
    </div>
    
    <button type="submit">Submit Score</button>
  </form>
)
```

**Acceptance Criteria:**
- ✅ Form labels clear for singles (You vs Opponent)
- ✅ Form labels clear for doubles (Team names)
- ✅ Help text explains format with team/player names
- ✅ Validation unchanged (no ties allowed)
- ✅ Mobile responsive (full width input)

---

### Task 5.8a: Create Partner Selection UI

**File:** `packages/frontend/src/components/PartnerSelection.tsx` (new file)

**Implementation:** Radio buttons and conditional rendering

```typescript
interface PartnerSelectionProps {
  partnerOption: 'select' | 'invite'
  onOptionChange: (option: 'select' | 'invite') => void
}

export function PartnerSelection({ partnerOption, onOptionChange }: PartnerSelectionProps) {
  return (
    <div className="partner-selection">
      <fieldset>
        <legend>How do you want to find your partner?</legend>

        <div className="radio-option">
          <label>
            <input
              type="radio"
              value="select"
              checked={partnerOption === 'select'}
              onChange={e => onOptionChange(e.target.value as 'select')}
            />
            <span>Select from registered players</span>
            <small>Choose a player already registered for this tournament</small>
          </label>
        </div>

        <div className="radio-option">
          <label>
            <input
              type="radio"
              value="invite"
              checked={partnerOption === 'invite'}
              onChange={e => onOptionChange(e.target.value as 'invite')}
            />
            <span>Invite by email</span>
            <small>Invite someone new to join as your partner</small>
          </label>
        </div>
      </fieldset>
    </div>
  )
}
```

**Styling:**
```css
.partner-selection fieldset {
  border: none;
  padding: 0;
}

.partner-selection legend {
  font-weight: 600;
  margin-bottom: 12px;
}

.radio-option {
  margin-bottom: 12px;
  padding: 12px;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
}

.radio-option input[type="radio"] {
  margin-right: 8px;
}

.radio-option span {
  font-weight: 500;
  display: block;
}

.radio-option small {
  display: block;
  margin-top: 4px;
  color: #6b7280;
  font-size: 0.75rem;
}
```

**Acceptance Criteria:**
- ✅ Radio buttons for both options
- ✅ Clear labels and descriptions
- ✅ Conditional rendering works correctly
- ✅ Accessibility (fieldset, legend)
- ✅ Mobile responsive

---

### Task 5.8b: Implement Partner Dropdown

**File:** `packages/frontend/src/components/PartnerDropdown.tsx` (new file)

**Implementation:** Fetch and display available partners

```typescript
interface PartnerDropdownProps {
  tournamentId: string
  value: string
  onChange: (partnerId: string) => void
}

export function PartnerDropdown({ tournamentId, value, onChange }: PartnerDropdownProps) {
  const [partners, setPartners] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchAvailablePartners()
  }, [tournamentId])

  const fetchAvailablePartners = async () => {
    try {
      const response = await fetch(`/api/tournaments/${tournamentId}/available-partners`)
      const data = await response.json()
      setPartners(data.partners)
    } catch (err) {
      console.error('Failed to load partners', err)
    } finally {
      setLoading(false)
    }
  }

  if (loading) return <div className="loading">Loading partners...</div>

  if (partners.length === 0) {
    return (
      <div className="no-partners">
        No other players available to team up. Try inviting someone instead.
      </div>
    )
  }

  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className="partner-dropdown"
    >
      <option value="">-- Select a partner --</option>
      {partners.map(partner => (
        <option key={partner.id} value={partner.id}>
          {partner.name}
        </option>
      ))}
    </select>
  )
}
```

**Acceptance Criteria:**
- ✅ Fetch available partners on mount
- ✅ Show loading state
- ✅ Display partners in dropdown
- ✅ Handle empty state
- ✅ Pass selected value to parent

---

### Task 5.8c: Implement Partner Invite Input

**File:** `packages/frontend/src/components/PartnerInviteInput.tsx` (new file)

**Implementation:** Email input with validation

```typescript
interface PartnerInviteInputProps {
  value: string
  onChange: (email: string) => void
  onBlur?: () => void
  error?: string
}

export function PartnerInviteInput({
  value,
  onChange,
  onBlur,
  error
}: PartnerInviteInputProps) {
  const [touched, setTouched] = useState(false)

  const handleBlur = () => {
    setTouched(true)
    onBlur?.()
  }

  const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
  const showError = touched && value && !isValidEmail

  return (
    <div className="invite-input-group">
      <input
        type="email"
        placeholder="partner@example.com"
        value={value}
        onChange={e => onChange(e.target.value)}
        onBlur={handleBlur}
        className={`partner-email ${showError ? 'error' : ''}`}
      />
      {showError && (
        <span className="error-message">Please enter a valid email</span>
      )}
      {error && (
        <span className="error-message">{error}</span>
      )}
      <small className="helper-text">
        They'll receive an email invitation and create their account
      </small>
    </div>
  )
}
```

**Styling:**
```css
.invite-input-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.partner-email {
  padding: 8px 12px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 1rem;
}

.partner-email.error {
  border-color: #ef4444;
  background-color: #fef2f2;
}

.error-message {
  color: #ef4444;
  font-size: 0.75rem;
  font-weight: 500;
}

.helper-text {
  color: #6b7280;
  font-size: 0.75rem;
}
```

**Acceptance Criteria:**
- ✅ Email input with placeholder
- ✅ Real-time validation
- ✅ Show error only after blur
- ✅ Display helper text
- ✅ Pass value to parent

---

### Task 5.8d: Handle Form Submission

**File:** `packages/frontend/src/pages/TournamentBrowse.tsx` (modify registration section)

**Implementation:** Wire up partner selection to form

```typescript
const isSingles = tournament.matchFormat === 'singles'
const isDoubles = tournament.matchFormat === 'doubles'

return (
  <section className="registration">
    {isSingles ? (
      <SinglesRegistration tournament={tournament} />
    ) : (
      <DoublesRegistration tournament={tournament} />
    )}
  </section>
)

function DoublesRegistration({ tournament }: { tournament: Tournament }) {
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [partnerOption, setPartnerOption] = useState<'select' | 'invite'>('select')
  const [selectedPartnerId, setSelectedPartnerId] = useState('')
  const [inviteEmail, setInviteEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const partnerSelection =
        partnerOption === 'select'
          ? { type: 'select', value: selectedPartnerId }
          : { type: 'invite', value: inviteEmail }

      const response = await fetch(
        `/api/tournaments/${tournament.id}/register`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email,
            name,
            partnerSelection
          })
        }
      )

      if (response.ok) {
        // Show success message
        // Redirect to confirmation or standings
      } else {
        const data = await response.json()
        setError(data.message)
      }
    } catch (err) {
      setError('Failed to register. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <h3>Register as a Team</h3>

      {error && <div className="error-banner">{error}</div>}

      <div className="form-group">
        <label htmlFor="email">Your Email</label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          required
        />
      </div>

      <div className="form-group">
        <label htmlFor="name">Your Name</label>
        <input
          id="name"
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          required
        />
      </div>

      <div className="form-group">
        <label>Partner Selection</label>
        <PartnerSelection partnerOption={partnerOption} onOptionChange={setPartnerOption} />

        {partnerOption === 'select' && (
          <PartnerDropdown
            tournamentId={tournament.id}
            value={selectedPartnerId}
            onChange={setSelectedPartnerId}
          />
        )}

        {partnerOption === 'invite' && (
          <PartnerInviteInput
            value={inviteEmail}
            onChange={setInviteEmail}
            error={error}
          />
        )}
      </div>

      <button type="submit" disabled={loading} className="btn-primary">
        {loading ? 'Registering...' : 'Register as Team'}
      </button>
    </form>
  )
}
```

**Acceptance Criteria:**
- ✅ Wire together all partner selection components
- ✅ Build correct payload for API
- ✅ Handle both partner scenarios
- ✅ Show error messages
- ✅ Loading state during submission
- ✅ Success handling

---

### Task 5.9: Partner Confirmation Page (NEW)

**File:** `packages/frontend/src/pages/PartnerConfirmation.tsx` (new file)

**Route:** `/registrations/:registrationId/confirm`

**Implementation:**

```typescript
import { useParams } from 'react-router-dom'
import { useEffect, useState } from 'react'

export function PartnerConfirmation() {
  const { registrationId } = useParams<{ registrationId: string }>()
  const [status, setStatus] = useState<'loading' | 'success' | 'waiting' | 'error'>('loading')
  const [confirmation, setConfirmation] = useState<any>(null)
  const [autoRedirect, setAutoRedirect] = useState(false)

  useEffect(() => {
    confirmPartnership()
  }, [registrationId])

  useEffect(() => {
    if (status === 'success' && !autoRedirect) {
      const timer = setTimeout(() => {
        setAutoRedirect(true)
        // Redirect to tournament
      }, 3000)
      return () => clearTimeout(timer)
    }
  }, [status])

  const confirmPartnership = async () => {
    try {
      const response = await fetch(`/api/registrations/${registrationId}/confirm`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' }
      })

      if (response.ok) {
        const data = await response.json()
        setConfirmation(data.partnership)
        setStatus(data.partnership.bothConfirmed ? 'success' : 'waiting')
      } else {
        setStatus('error')
      }
    } catch (err) {
      setStatus('error')
    }
  }

  if (status === 'loading') {
    return <div className="confirmation-page"><p>Confirming partnership...</p></div>
  }

  if (status === 'error') {
    return (
      <div className="confirmation-page error">
        <h2>❌ Confirmation Failed</h2>
        <p>Could not confirm partnership. The link may have expired.</p>
        <a href="/browse">Back to tournaments</a>
      </div>
    )
  }

  return (
    <div className="confirmation-page">
      {status === 'success' && (
        <>
          <h2>✓ Partnership Complete!</h2>
          <div className="team-info">
            <p>Team: {confirmation.partnerId} & [your name]</p>
            <p>Status: Ready for group stage</p>
          </div>
          <p className="redirect-message">Redirecting to tournament in 3 seconds...</p>
        </>
      )}

      {status === 'waiting' && (
        <>
          <h2>✓ Your confirmation received</h2>
          <div className="team-info">
            <p>Waiting for your partner to confirm...</p>
          </div>
          <button onClick={() => confirmPartnership()}>
            Refresh status
          </button>
          <p>
            <small>Auto-refresh every 10 seconds</small>
          </p>
        </>
      )}
    </div>
  )
}
```

**Styling:**
```css
.confirmation-page {
  max-width: 500px;
  margin: 60px auto;
  padding: 20px;
  text-align: center;
  border-radius: 8px;
  background: #f9fafb;
}

.confirmation-page.error {
  background: #fee2e2;
  border: 1px solid #fecaca;
}

.team-info {
  background: white;
  padding: 16px;
  border-radius: 6px;
  margin: 20px 0;
  border-left: 4px solid #10b981;
}

.redirect-message {
  color: #666;
  font-size: 0.875rem;
}
```

**Acceptance Criteria:**
- ✅ Calls confirmation API endpoint on load
- ✅ Shows "success" state when both confirmed
- ✅ Shows "waiting" state when only self confirmed
- ✅ Auto-redirects after 3 seconds on success
- ✅ Shows error for invalid/expired links
- ✅ Allows manual refresh of status
- ✅ Mobile responsive
- ✅ **All tests from Phase 5.0 pass GREEN**

---

### Phase 5.REFACTOR: Refactor While Maintaining Test Pass

**Task 5.10: Refactor Frontend Components**

**Scope:** While all tests pass, optimize component structure

```typescript
// Review these aspects for refactoring:
// 1. Extract common conditional rendering patterns
// 2. Consolidate styling (singles vs doubles variants)
// 3. Extract reusable sub-components
// 4. Simplify component prop interfaces
// 5. Add meaningful comments only where component behavior is non-obvious
```

**Acceptance Criteria:**
- ✅ Components more readable and maintainable
- ✅ All tests from Phase 5.0 still pass
- ✅ No UI changes (same visual output)
- ✅ No performance regressions
- ✅ Common patterns extracted
- ✅ Prop drilling reduced where possible

**Verification:**
```bash
npm test -- packages/frontend/src/__tests__/components/
npm test -- packages/frontend/src/__tests__/doubles-tournament-flow.e2e.spec.ts
# All tests should PASS
```

---

## Phase 6: Final Verification

**Duration:** 1 day (coverage verification, not test writing)  
**Risk Level:** Low (verification only)  
**Rollback:** Not needed (no code changes)

**Purpose:** Verify all tests pass, coverage targets met, regression tests green

### Task 6.1: Run Full Test Suite

**Verification:** Execute all tests across all phases

```bash
# Phase 2 tests (Group Formation & Match Generation)
npm test -- packages/core-logic/src/__tests__/teams.spec.ts
npm test -- packages/api/src/__tests__/integration/doubles-group-formation.spec.ts

# Phase 2.5 tests (Partner Confirmation & Registration)
npm test -- packages/api/src/__tests__/integration/doubles-partner-confirmation.spec.ts

# Phase 3 tests (Standings Calculation)
npm test -- packages/core-logic/src/__tests__/standings.spec.ts

# Phase 4 tests (API Routes)
npm test -- packages/api/src/__tests__/utils/match-utils.spec.ts
npm test -- packages/api/src/__tests__/integration/doubles-score-submission.spec.ts
npm test -- packages/api/src/__tests__/integration/doubles-api-endpoints.spec.ts

# Phase 5 tests (Frontend Components)
npm test -- packages/frontend/src/__tests__/components/
npm test -- packages/frontend/src/__tests__/doubles-tournament-flow.e2e.spec.ts

# All tests
npm test
```

**Expected Results:**
- ✅ All new doubles tests pass (80+ tests)
- ✅ All existing singles tests still pass (2,126+ tests)
- ✅ **Total: 2,200+ tests passing**
- ✅ No test regressions

**Acceptance Criteria:**
- ✅ New test suite passes 100%
- ✅ Existing test suite passes 100%
- ✅ No regressions detected
- ✅ Build/CI passes

---

### Task 6.2: Verify Test Coverage

**Coverage Targets:**

```bash
npm test -- --coverage
```

**Expected Coverage:**
- ✅ Core logic (Phase 2-3): 100% coverage
- ✅ API routes (Phase 4): 95%+ coverage
- ✅ Frontend components (Phase 5): 90%+ coverage
- ✅ Overall: 87%+ statement coverage (maintained from current 87.52%)
- ✅ Overall: 85%+ branch coverage (maintained from current 85.27%)

**Acceptance Criteria:**
- ✅ All new code has coverage
- ✅ No regression in overall coverage
- ✅ Critical paths have 100% coverage
- ✅ Coverage report generated

---

### Task 6.3: Regression Testing

**Scope:** Verify singles tournaments unaffected

```typescript
// Run existing singles tests to ensure no regressions
npm test -- packages/api/src/__tests__/integration/singles-*.spec.ts

// Specific critical paths:
// - Singles group formation
// - Singles match generation
// - Singles score submission
// - Singles standings calculation
// - Singles bracket seeding
```

**Acceptance Criteria:**
- ✅ All singles tests pass
- ✅ No performance regressions
- ✅ API backwards compatible
- ✅ Database migrations safe

---

### Task 6.4: Documentation Verification

**Checklist:**

- ✅ All logging statements follow CLAUDE.md standards
  - Module-level loggers created: `const log = getLogger('module-name')`
  - Event names follow `noun.verb` pattern (past tense)
  - INFO level for state changes: team.created, partnership.confirmed, score.submitted
  - Actor identity included: playerId, tournamentId, groupId
  - No sensitive data logged: tokens, passwords, full bodies
  
- ✅ All error handling documented
  - 403 errors for unauthorized access
  - 400 errors for validation failures
  - 404 errors for missing resources
  
- ✅ All API changes documented
  - New endpoints listed
  - Request/response examples provided
  - Error codes documented

**Acceptance Criteria:**
- ✅ Logging standards verified
- ✅ Error handling consistent
- ✅ API documentation complete
- ✅ No gaps in documentation

---

## Phase 7: Integration & Rollout

**Duration:** 1 day  
**Risk Level:** Medium (feature flag management)  
**Rollback:** Disable feature flag

### Task 7.1: Feature Flag Implementation

**File:** `packages/api/src/config/features.ts` (new or modify existing)

```typescript
export const features = {
  doublesSupport: {
    enabled: process.env.FEATURE_DOUBLES_SUPPORT === 'true',
    description: 'Allow creation and management of doubles tournaments',
    rolloutPercentage: 0, // 0-100% of users
    createdAt: new Date('2026-06-15'),
    targetDate: new Date('2026-07-01')
  }
}

export function isDoublesEnabled(): boolean {
  return features.doublesSupport.enabled
}
```

**Environment Variable:**
```bash
# .env.local (development)
FEATURE_DOUBLES_SUPPORT=true

# .env.production
FEATURE_DOUBLES_SUPPORT=false  # Launch with off

# .env.staging
FEATURE_DOUBLES_SUPPORT=true   # Test with on
```

**Acceptance Criteria:**
- ✅ Flag controls doubles tournament creation
- ✅ Can be toggled without code deploy
- ✅ Set to OFF for production launch
- ✅ Set to ON for staging

---

### Task 7.2: API Guard - Prevent Doubles on Old Code

**File:** `packages/api/src/routes/tournaments.ts` (modify tournament creation)

```typescript
router.post('/', async (req, res, next) => {
  const payload = await requireOrganizerAuth(...)
  
  if (req.body.matchFormat === 'doubles' && !isDoublesEnabled()) {
    return res.status(400).json({
      code: 'FEATURE_NOT_AVAILABLE',
      message: 'Doubles tournaments not yet available'
    })
  }
  
  // ... rest of creation logic
})
```

**Acceptance Criteria:**
- ✅ Prevents doubles tournament creation if flag off
- ✅ Clear error message to API consumers
- ✅ Singles tournaments unaffected

---

### Task 7.3: Rollout Plan

**Rollout Schedule:**

**Stage 1: Development (2-3 days)**
- All developers test with `FEATURE_DOUBLES_SUPPORT=true`
- Code review: verify all conditional logic
- Run full test suite: 2,126 + new 80 tests = 2,206 passing

**Stage 2: Staging (3-5 days)**
- Deploy with feature flag ON
- Internal QA team tests doubles flow
- Beta users test (controlled)
- Verify no regressions in singles

**Stage 3: Production (Go/No-go decision)**
- **Go:** Enable flag for 10% of new tournaments
- **Monitor:** Error rates, performance metrics
- **Ramp:** 25% → 50% → 100% over 1 week
- **No-go:** Disable flag, investigate issues

**Monitoring During Rollout:**
```typescript
// Track feature usage
log.info('doubles_tournament.created', {
  tournamentId,
  teamCount,
  timestamp
})

// Track errors by feature
log.error('doubles.error', {
  code: err.code,
  feature: 'doubles',
  context: { tournamentId, groupId }
})
```

**Acceptance Criteria:**
- ✅ Feature flag controls rollout
- ✅ Monitoring in place
- ✅ Rollback procedure documented
- ✅ Communication plan for users

---

## Success Criteria

### Functional Requirements
- ✅ Teams can be created from partnerships
- ✅ Groups divide teams into sub-tournaments
- ✅ Matches generated between teams (not individuals)
- ✅ Standings calculated per team
- ✅ Both team members can submit scores
- ✅ Real-time updates broadcast to all participants
- ✅ Knockout brackets seeded by team standings
- ✅ Frontend displays teams clearly

### Technical Requirements
- ✅ Zero changes to singles tournament logic
- ✅ All existing 2,126 tests passing
- ✅ 80+ new tests for doubles (15%+ increase)
- ✅ Database migrations backwards compatible
- ✅ Feature flag controls rollout
- ✅ Code review + QA sign-off

### Performance Requirements
- ✅ Team standings recalculation < 500ms (same as singles)
- ✅ API response times unchanged
- ✅ No database query plan regressions

### Rollout Requirements
- ✅ Feature off by default in production
- ✅ Can be toggled without code deploy
- ✅ Monitoring and alerting in place
- ✅ Rollback procedure documented

---

## Risk Mitigation

| Risk | Mitigation | Probability |
|------|------------|-------------|
| Regression in singles logic | Parallel test suites, full regression testing | Low |
| Database constraint violation | Careful migration design, data validation | Low |
| API timeout on large tournaments | No algorithmic change, performance verified | Very Low |
| User confusion (singles vs doubles) | Clear UI labels, feature flag off initially | Low |
| Score submission bugs | Comprehensive unit tests, E2E coverage | Low |

---

## Timeline Summary

**TDD Approach reduces timeline 30-40% per `TDD_STRATEGY.md`**

| Phase | Duration | Status |
|-------|----------|--------|
| Phase 1: Database | 1 day | Design |
| Phase 2: Core Logic (RED-GREEN-REFACTOR) | 1.5 days | Design |
| Phase 2.5: Partner Registration (RED-GREEN-REFACTOR) | 1 day | Design |
| Phase 3: Standings (RED-GREEN-REFACTOR) | 0.75 days | Design |
| Phase 4: API Routes (RED-GREEN-REFACTOR) | 1.25 days | Design |
| Phase 5: Frontend (RED-GREEN-REFACTOR) | 3 days | Design |
| Phase 6: Verification | 1 day | Design |
| Phase 7: Rollout | 1 day | Design |
| **Total** | **~9.5 days** | **Ready for implementation (33% faster than pre-TDD 14.45 days)** |

**Breakdown by Approach:**

**Pre-TDD (Original): 14.45 days**
- Code first, test last (Phase 6 isolated)
- Rework required due to defects
- Integration testing done late
- High risk of regressions

**TDD (This Plan): 9.5 days (33% reduction)**
- Tests first (RED phase in each feature phase)
- Minimal code to pass (GREEN phase)
- Refactoring with safety (REFACTOR phase)
- Comprehensive coverage throughout
- Lower risk, faster overall delivery
- 80+ tests distributed across phases (not isolated)

**Phase 2 Breakdown (1.5 days):**
- Phase 2.0.1: Write Team Model Tests (RED)
- Phase 2.0.2: Write Group Formation Tests (RED)
- Phase 2.0.3: Write Match Generation Tests (RED)
- Task 2.1: Implement Team Helpers (GREEN)
- Task 2.2: Implement Team Repository (GREEN)
- Task 2.3: Implement Group Formation (GREEN)
- Task 2.4: Implement Match Generation (GREEN)
- Task 2.5: Refactor While Passing (REFACTOR)

**Phase 2.5 Breakdown (1 day):**
- Phase 2.5.0.1: Write Partner Confirmation Tests (RED)
- Phase 2.5.0.2: Write Registration Tests (RED)
- Tasks 2.5.1-2.5.4: Implement Partner Features (GREEN)
- Task 2.5.6: Refactor Partner Flow (REFACTOR)

**Phase 3 Breakdown (0.75 days):**
- Phase 3.0.1: Write Generic Standings Tests (RED)
- Tasks 3.1-3.2: Implement Standings (GREEN)
- Task 3.3: Refactor Standings (REFACTOR)

**Phase 4 Breakdown (1.25 days):**
- Phase 4.0.1-4.0.3: Write API Tests (RED)
- Tasks 4.1-4.3: Implement API Routes (GREEN)
- Task 4.4: Refactor Routes (REFACTOR)

**Phase 5 Breakdown (3 days):**
- Phase 5.0.1-5.0.3: Write Component Tests (RED)
- Tasks 5.1-5.9: Implement Components (GREEN)
- Task 5.10: Refactor Components (REFACTOR)

---

## Dependencies & Blockers

**Hard Dependencies (TDD Order):**
- Phase 1 before Phase 2.RED (teams table needed before writing tests)
- Phase 2.RED before Phase 2.GREEN (tests define what to implement)
- Phase 2.GREEN before Phase 2.REFACTOR (code must work before refactoring)
- Phase 2 complete before Phase 2.5.RED (group formation logic needed)
- Phase 2.5.RED before Phase 2.5.GREEN
- Phase 2.5.GREEN before Phase 2.5.REFACTOR
- Phase 2.5 complete before Phase 3.RED (partners must be confirmable before standings test)
- Phase 3.RED before Phase 3.GREEN
- Phase 3.GREEN before Phase 3.REFACTOR
- Phase 3 complete before Phase 4.RED (standings must exist before API testing)
- Phase 4.RED before Phase 4.GREEN
- Phase 4.GREEN before Phase 4.REFACTOR
- Phase 5.RED can start after Phase 3 (tests don't require API implementation details)
- Phase 5.RED before Phase 5.GREEN
- Phase 5.GREEN before Phase 5.REFACTOR
- Phases 4 & 5 can overlap (start Phase 5.RED when Phase 3 complete)

**Soft Dependencies:**
- Phase 6 runs after all code phases complete (verification only)
- Phase 7 can begin during Phase 6 (rollout planning)

**Parallelization Opportunities:**
- Phase 2.RED, Phase 2.5.RED can be written in parallel (different features)
- Phase 2.GREEN and Phase 2.5.GREEN can be implemented in parallel (after respective RED phases)
- Phase 4.RED and Phase 5.RED can be written in parallel (after Phase 3.RED)
- Phase 4.GREEN and Phase 5.GREEN can overlap (once Phase 4.RED complete)
- Phase 6 and Phase 7 can overlap (verification while planning rollout)

**Critical Path:**
1. Phase 1 (1 day)
2. Phase 2 (1.5 days)
3. Phase 2.5 (1 day)
4. Phase 3 (0.75 days)
5. Phase 4 (1.25 days) OR Phase 5 (3 days) - can overlap after Phase 3
6. Phase 5 (3 days) if not started with Phase 4
7. Phase 6 (1 day)
8. Phase 7 (1 day)

**Minimum Sequential Time:** 9.5 days (no parallelization)

**With Optimal Parallelization:**
- Phases 4 & 5 overlap: saves ~1.25 days
- Phases 6 & 7 overlap: saves ~0.5 days
- **Optimized timeline: ~7.75 days**

**Blockers:**
- None identified

---

## Document Maintenance

**Document Owner:** Development Team  
**Last Updated:** 2026-06-01  
**Next Review:** Before Phase 1 implementation  
**Revision History:**
- v2.0 (2026-06-01): Restructured for TDD compliance per `TDD_STRATEGY.md`
  - Moved test writing to RED phases (before implementation)
  - Introduced GREEN phases (minimal implementation)
  - Introduced REFACTOR phases (cleanup while passing tests)
  - Distributed 80+ tests across phases instead of isolated Phase 6
  - Reduced timeline from 14.45 to 9.5 days (33% efficiency gain)
  - Updated dependencies to reflect TDD RED-GREEN-REFACTOR order
  - Organized phases into RED-GREEN-REFACTOR structure
- v1.0 (2026-06-01): Initial design, Option 3 approach
