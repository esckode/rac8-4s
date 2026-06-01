# Doubles Tournament Support Requirements

**Document Version:** 1.0  
**Status:** Design Phase  
**Approach:** Option 3 - Minimal Refactor with Team Participant Model  
**Timeline:** 5-7 days  
**Estimated Scope:** ~1000 lines of code

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

**Duration:** 2 days  
**Risk Level:** Medium (modifies match generation algorithm)  
**Rollback:** Feature-flag off, revert to single-player logic

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

### Task 2.3: Refactor Group Formation Logic

**File:** `packages/api/src/db.ts` (modify existing)

**Current code location:** Search for "Generate groups and matches"

**Refactoring:**

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

### Task 2.4: Refactor Match Generation

**File:** `packages/api/src/db.ts` (modify existing)

**Current code location:** Search for "Generate round-robin"

**Refactoring:**

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

---

## Phase 3: Standings Calculation

**Duration:** 1 day  
**Risk Level:** Low (generic refactor, backwards compatible)  
**Rollback:** Revert type changes only

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

---

## Phase 4: API Routes & Validation

**Duration:** 1.5 days  
**Risk Level:** Medium (validates user input)  
**Rollback:** Revert route changes

### Task 4.1: Score Submission Validation

**File:** `packages/api/src/routes/tournaments.ts` (modify score submission endpoint)

**Current code location:** Search for `POST /tournaments/:tournamentId/matches/:matchId/score`

**Refactoring:**

```typescript
router.post('/:tournamentId/matches/:matchId/score', async (req, res, next) => {
  const payload = await requirePlayerSessionAuth(req.headers.authorization, deps.tokenStore)
  const match = await getGroupMatch(req.params.matchId)
  
  if (!match) {
    return res.status(404).json({ code: 'NOT_FOUND' })
  }
  
  // Determine match type and validate player participation
  const canSubmit = await canPlayerSubmitScore(match, payload.playerId)
  
  if (!canSubmit) {
    return res.status(403).json({ code: 'FORBIDDEN', message: 'You are not in this match' })
  }
  
  // Rest of logic unchanged
  const score = parseScore(req.body.score)
  // ... validation, db update, etc.
})

async function canPlayerSubmitScore(match: any, playerId: string): Promise<boolean> {
  if (match.player1_id) {
    // Singles match
    return match.player1_id === playerId || match.player2_id === playerId
  } else if (match.team1_id) {
    // Doubles match: check if player is on either team
    const team1 = await getTeamById(match.team1_id)
    const team2 = await getTeamById(match.team2_id)
    
    return (
      team1.player1_id === playerId || team1.player2_id === playerId ||
      team2.player1_id === playerId || team2.player2_id === playerId
    )
  }
  
  return false
}
```

**Acceptance Criteria:**
- ✅ Singles matches validate correctly (2 players)
- ✅ Doubles matches validate correctly (4 players, 2 teams)
- ✅ Returns 403 if player not in match
- ✅ Edge case: same player on both teams rejected

**Test Cases:**
```typescript
// Singles: player1 can submit
// Singles: player2 can submit
// Singles: player3 cannot submit (403)
// Doubles: team1.player1 can submit
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

---

## Phase 5: Frontend Display

**Duration:** 1.5 days  
**Risk Level:** Low (UI only, no logic changes)  
**Rollback:** Revert component changes

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

## Phase 6: Testing

**Duration:** 2 days  
**Risk Level:** Low (adds tests, doesn't modify existing)  
**Rollback:** Not needed (tests are additive)

### Task 6.1: Unit Tests - Team Model

**File:** `packages/core-logic/src/__tests__/teams.spec.ts` (new file)

```typescript
describe('Team Model', () => {
  it('should generate unique team IDs', () => {
    const id1 = generateTeamId()
    const id2 = generateTeamId()
    expect(id1).not.toBe(id2)
    expect(id1).toMatch(/^team_/)
  })

  it('should validate that teams have different players', () => {
    expect(() => validateTeamPlayers('p1', 'p1')).toThrow()
    expect(() => validateTeamPlayers('p1', 'p2')).not.toThrow()
  })
})
```

**Acceptance Criteria:**
- ✅ All team utility functions tested
- ✅ Edge cases covered (same player, etc.)
- ✅ 100% coverage

---

### Task 6.2: Integration Tests - Doubles Group Formation

**File:** `packages/api/src/__tests__/integration/doubles-group-formation.spec.ts` (new file)

**Structure (mirrors `singles-group-formation.spec.ts`):**

```typescript
describe('Doubles: Group Formation', () => {
  it('should create teams from partnerships', async () => {
    const tournament = await createTournament({ matchFormat: 'doubles' })
    await registerPlayerWithPartner(tournament.id, 'alice@test.com', 'bob@test.com')
    await registerPlayerWithPartner(tournament.id, 'charlie@test.com', 'diana@test.com')
    
    await advanceTournament(tournament.id, 'to_group_stage')
    
    const teams = await getTeamsInTournament(tournament.id)
    expect(teams).toHaveLength(2)
    expect(teams[0].player1Id).toBe('alice')
    expect(teams[0].player2Id).toBe('bob')
  })

  it('should divide teams into groups', async () => {
    // Create 8 teams (6 + 2)
    // Should create 2 groups of size 4 and 3
    
    const groups = await getGroupsForTournament(tournament.id)
    expect(groups).toHaveLength(2)
    
    const teamsInGroup1 = await getTeamsInGroup(groups[0].id)
    expect(teamsInGroup1).toHaveLength(4)
  })

  it('should generate round-robin matches between teams', async () => {
    // 4 teams should generate 6 matches (4*3/2)
    
    const matches = await getMatchesInGroup(group.id)
    expect(matches).toHaveLength(6)
    expect(matches[0].team1_id).toBeDefined()
    expect(matches[0].team2_id).toBeDefined()
    expect(matches[0].player1_id).toBeNull()
    expect(matches[0].player2_id).toBeNull()
  })
})
```

**Acceptance Criteria:**
- ✅ Team creation from partnerships
- ✅ Group division with correct sizes
- ✅ Round-robin match count correct
- ✅ Match references use team_id columns
- ✅ 15+ test cases

---

### Task 6.3: Integration Tests - Doubles Standings

**File:** `packages/api/src/__tests__/integration/doubles-standings.spec.ts` (new file)

```typescript
describe('Doubles: Standings Calculation', () => {
  it('should calculate standings for teams', async () => {
    const tournament = await setupDoublesTournament(4)
    const matches = await getGroupMatches(group.id)
    
    // Submit score: team1 wins 2-1
    await submitScore(matches[0].id, '2-1', team1PlayerId)
    
    const standings = await getGroupStandings(group.id)
    expect(standings[0].participantId).toBe(team1.id)
    expect(standings[0].wins).toBe(1)
    expect(standings[1].wins).toBe(0)
  })

  it('should apply tiebreakers to teams', async () => {
    // Team A: 1 win, 4 sets
    // Team B: 1 win, 3 sets
    // Team A should rank higher
  })

  it('should track head-to-head for teams', async () => {
    // If Team A and Team B both have 1 win
    // But Team A beat Team B directly
    // Team A should rank higher
  })
})
```

**Acceptance Criteria:**
- ✅ Standings calculation works with team IDs
- ✅ Tiebreaker logic applied correctly
- ✅ Head-to-head tracked per team
- ✅ 20+ test cases

---

### Task 6.4: Integration Tests - Doubles Score Submission

**File:** `packages/api/src/__tests__/integration/doubles-score-submission.spec.ts` (new file)

```typescript
describe('Doubles: Score Submission', () => {
  it('should allow team1.player1 to submit score', async () => {
    const response = await submitScore(matchId, '2-1', team1.player1Id)
    expect(response.status).toBe(202)
  })

  it('should allow team1.player2 to submit score', async () => {
    const response = await submitScore(matchId, '2-1', team1.player2Id)
    expect(response.status).toBe(202)
  })

  it('should reject unrelated player', async () => {
    const response = await submitScore(matchId, '2-1', 'unrelated_player_id')
    expect(response.status).toBe(403)
  })

  it('should update standings after score submission', async () => {
    await submitScore(matchId, '2-1', team1.player1Id)
    
    const standings = await getGroupStandings(groupId)
    expect(standings[0].participantId).toBe(team1.id)
    expect(standings[0].wins).toBe(1)
  })
})
```

**Acceptance Criteria:**
- ✅ Both team members can submit
- ✅ Non-team members rejected (403)
- ✅ Standings updated after submission
- ✅ 15+ test cases

---

### Task 6.5: E2E Tests - Doubles Tournament Flow

**File:** `packages/frontend/src/__tests__/doubles-tournament-flow.e2e.spec.ts` (new file)

```typescript
describe('Doubles: E2E Tournament Flow', () => {
  it('should complete doubles tournament from start to finish', async () => {
    // 1. Create tournament with matchFormat='doubles'
    await createTournament({ name: 'Spring Doubles Cup', matchFormat: 'doubles' })
    
    // 2. Register players with partners
    await registerPlayerWithPartner('alice@test.com', 'bob@test.com')
    await registerPlayerWithPartner('charlie@test.com', 'diana@test.com')
    
    // 3. Advance to group stage
    await advanceTournament('to_group_stage')
    
    // 4. Verify groups created with teams
    const standings = await page.getByRole('table')
    await expect(standings).toContainText('Alice & Bob')
    await expect(standings).toContainText('Charlie & Diana')
    
    // 5. Submit scores
    await submitScore('Team 1 vs Team 2', '2-1')
    await submitScore('Team 1 vs Team 3', '2-0')
    
    // 6. Verify standings updated (real-time)
    await expect(standings).toContainText('2 wins')
    
    // 7. Advance to knockout
    await advanceTournament('to_knockout')
    
    // 8. Verify bracket shows teams
    const bracket = await page.getByRole('heading', { name: /bracket/i })
    await expect(bracket).toContainText('Alice & Bob vs Charlie & Diana')
  })
})
```

**Acceptance Criteria:**
- ✅ Full tournament flow works
- ✅ Team names display correctly
- ✅ Real-time updates work for teams
- ✅ Bracket seeding by team standings

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

| Phase | Duration | Status |
|-------|----------|--------|
| Phase 1: Database | 1 day | Design |
| Phase 2: Core Logic | 2 days | Design |
| Phase 3: Standings | 1 day | Design |
| Phase 4: API Routes | 1.5 days | Design |
| Phase 5: Frontend | 1.5 days | Design |
| Phase 6: Testing | 2 days | Design |
| Phase 7: Rollout | 1 day | Design |
| **Total** | **~10 days** | **Ready for implementation** |

---

## Dependencies & Blockers

**Hard Dependencies:**
- None (all code additive)

**Soft Dependencies:**
- Complete Phase 1 before Phase 2
- Complete Phase 2 before Phase 3
- Phases 4, 5, 6 can proceed in parallel

**Blockers:**
- None identified

---

## Document Maintenance

**Document Owner:** Development Team  
**Last Updated:** 2026-06-01  
**Next Review:** Before Phase 1 implementation  
**Revision History:**
- v1.0 (2026-06-01): Initial design, Option 3 approach
