# Tournament Webapp Requirements

## Product Overview
A tournament management webapp for racket sports (tennis, pickleball, badminton, table tennis, etc.) that helps tournament organizers run tournaments from registration through bracket management to final results.

## Core Users
- **Primary**: Tournament organizers who need to manage tournaments from start to finish

## Tournament Types & Scale
- **Sports supported**: Multi-sport capable; each tournament is for a single sport (label-based)
- **Player scale**: 100+ players per tournament
- **Match formats**: Singles (1v1) or Doubles (2v2) per tournament (not mixed within one tournament)

## Tournament Structure

### Registration & Teams
- **Singles tournaments**: Players sign up individually
- **Doubles tournaments**: 
  - Players sign up individually with partner's registration email
  - Partner receives consent email and must confirm to form the team
  - Players can withdraw team and request a different partner before registration deadline
  - Only paired teams before deadline qualify for the tournament

### Group Stage
- Organizer specifies the number of groups (can be 1 for small tournaments)
- System auto-distributes players evenly and randomly across groups
- Organizer specifies how many players advance from each group (e.g., top 1, top 2, top 3, etc.)

### Knockout Stage
- Single-elimination bracket for v1
- All advancing players from group stage enter one knockout bracket
- No secondary/consolation brackets in v1

## Score Tracking

### Match Result Reporting
- One of the players involved in the match self-reports the final score
- Score format: text-based (e.g., "6-4, 6-3")
- Player sees their upcoming matches in a clean list, clicks a match to report

### Score Editing & Overrides
1. **Player submission deadline**: Players can edit scores until a configurable deadline
2. **Organizer override window**: After player deadline but before next bracket is declared, organizer can make corrections
3. **Lock point**: Once the next bracket is declared, scores are locked

### Visibility
- Once a score is submitted, it's reflected to all players involved in that match
- All players involved can edit until the deadline

## Future Considerations (Not in v1)
- Double-elimination brackets
- Swiss system
- Consolation/secondary brackets
- Detailed sport-specific scoring rules
- Mobile app
- Player rankings/seeding
- Advanced scheduling features (court assignments, time slots)

## Open Questions - To Be Answered
- Technology stack (frontend framework, backend, database, hosting)
- Timeline/launch date
- Budget/resource constraints
- Greenfield vs. augmenting existing system
