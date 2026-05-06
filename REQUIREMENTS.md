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
  - Confirmation deadline: Partner must confirm by the tournament's registration deadline
  - If partner doesn't confirm by registration deadline, the team is disqualified
  - Players can withdraw team and request a different partner before registration deadline
  - Only paired teams before deadline qualify for the tournament
- **Player tokens**: Each player gets a new magic link token per tournament registration (not reused across tournaments)
- **Concurrent tournaments**: Players can register for and participate in unlimited tournaments simultaneously

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

## Authentication & Access

### Player Registration & Access
- **Registration method**: Magic link (passwordless) — player enters name + email, receives emailed access link with unique token
- **Magic link expiry**: Token expires after a configurable TTL (recommend 24-48 hours)
- **Registration discovery**: Public tournament listing page — players browse available tournaments and self-register
- **Access**: Player needs valid magic link to log in; session stored in Redis with TTL

### Organizer Authentication
- **Login method**: Email + password
- **Account creation**: Organizers sign up with email/password (password hashed with bcrypt, bcrypt recommended)
- **Session storage**: JWT or session token stored in Redis

### Multi-Tournament & Co-Organizers
- **Scope**: One organizer account can create and manage multiple tournaments
- **Access control**: Organizer can access only tournaments they created or were assigned to as co-organizer
- **Co-organizer invitation**: Tournament creator sends email invite to another organizer; invitee must accept and have/create an organizer account

## Tournament Lifecycle & Phases

### Tournament States
1. **Registration Open** — Players can register; organizer can configure but not start groups
2. **Registration Closed** — No more player registrations; organizer prepares groups
3. **Group Stage Active** — Matches scheduled, players submitting scores
4. **Group Stage Complete** — Standings calculated, organizer reviews and advances
5. **Knockout Active** — Bracket declared, players submitting scores per round
6. **Tournament Complete** — All matches finished, results public

### Phase Transitions
- **Hybrid model**: Organizer sets target dates for each phase, but can manually override/advance at any time
- **Example**: Group stage deadline is set to May 15, but organizer can declare group stage complete earlier if all scores submitted

## Group Stage Details

### Group Distribution
- **Algorithm**: For v1, players are randomly distributed evenly across N groups
- **Default group count**: System suggests number of groups based on player count; organizer can adjust
- **Group configuration**: Organizer can specify the number of groups before groups are created
- **Match format**: Round-robin — every player in a group plays every other player in that group once
- **Advancement**: Organizer specifies how many players advance from each group (e.g., top 1, top 2, top 3)
- **Future enhancement**: Seeding-based distribution (by player rankings/skill) planned for v2+

### Group Standings Calculation
- **Primary ranking**: Win/loss record (most wins → highest rank)
- **Tiebreaker 1**: Sets won (total sets won across all group matches)
- **Tiebreaker 2**: Head-to-head result between tied players
- **Tiebreaker 3**: If still tied, coin flip / random determination

### Group Stage Match Visibility
- **Match schedule visibility**: All players in a group can see the full round-robin match schedule
- **Results visibility**: All players in a group can see all match results and standings in real-time
- **Match timing**: No predefined match times; players self-organize to schedule their matches within the group stage deadline

### Score Deadline — Group Stage
- **Single deadline**: Organizer sets one date/time deadline for all group stage scores
- **Enforcement**: Once deadline passes, players cannot edit/submit new scores
- **Organizer override window**: Organizer can still correct scores after player deadline but before advancing to knockout

## Knockout Stage Details

### Bracket Generation & Seeding
- **Seeding**: Players seeded by their group stage ranking (win/loss + sets won)
- **Bye assignment**: When advancing player count isn't a power of 2, top seeds automatically receive byes in round 1
  - Example: 13 advancing players → 16 bracket slots → top 3 seeds get byes → 10 matches in round 1
- **Single bracket**: All advancing players enter one knockout bracket (no separate consolation brackets in v1)
- **Bracket preview & approval**: After bracket is generated, organizer reviews it before it's revealed to players
  - Organizer can see the full bracket structure but players don't see it yet
  - Organizer can adjust/override seeding or byes if needed before publishing
  - Once organizer approves and publishes, bracket becomes visible to all players and public

### Score Deadline — Knockout Rounds
- **Per-round deadline**: Each knockout round has a configurable submission window for scores (e.g., 2 hours or a set date/time)
- **Lock trigger**: Scores lock when **either** the submission deadline passes **OR** organizer manually advances to the next round (whichever comes first)
- **Organizer control**: Organizer can manually advance before the deadline if all scores are submitted
- **Organizer override window**: Same as group stage — window exists between player deadline and round advance

## Score Tracking — Detailed

### Score Submission
- **Who submits**: One player involved in the match self-reports the final score
- **Format**: Text-based (e.g., "6-4, 6-3" for tennis, "11-9, 11-7" for pickleball)
- **Validation & parsing**: 
  - System validates score format strictly (e.g., "X-Y, X-Y" pattern)
  - Auto-parses score to extract sets won by each player
  - Displays parsed result to player for confirmation before submission (prevents silent parsing errors)
  - Score text and parsed set counts both stored in database

### Score Conflicts
- **Collision handling**: If both players submit different scores for the same match, last submission wins
- **No conflict detection**: System does not flag or block conflicting submissions
- **Organizer override**: Organizer can override any score at any time (even after phase deadline) with a note explaining the reason

### Score Visibility
- Once a score is submitted, it's immediately visible to all players involved in that match
- All players involved can edit/re-submit until the phase deadline

## Mid-Tournament Player Withdrawal

### Withdrawal Handling
- **Group stage withdrawal**: If a player withdraws after registration closes, all their remaining unplayed matches are canceled
  - Opponents' match records are unaffected (no automatic win or loss; the match is simply canceled)
  - Standings are recalculated without the withdrawn player
  - Opponent's opponent count may be fewer than others, but that's reflected in standings calculation
- **Knockout withdrawal**: If a player withdraws before their knockout match, opponent advances (automatic bye)
- **Doubles withdrawal**: If one member of a doubles team withdraws, the entire team is withdrawn

### Unreported Matches
- **Deadline passed, no score submitted**: If neither player submits a score by the deadline:
  - Organizer manually reviews unreported matches
  - Organizer decides per match: cancel (opponent unaffected), grant opponent a bye, or override with a default result
  - No automatic handling; each case handled individually

## Tournament Visibility & Public Access

### Public Views
- Tournament brackets and results are publicly viewable without login
- Players and spectators can view public bracket links to see live standings and match results
- Public bracket is read-only — no edits allowed from public view

### Player Visibility
- Players can only view their own upcoming matches and tournament dashboard while logged in (via magic link)
- Players can view all group stage and knockout results once those matches are complete

## Notifications

### Player Notifications (Email)
Automated email notifications sent to players at the following events:
1. **Match scheduled** — Players notified when a match is assigned to them (group stage and knockout)
2. **Score submitted** — Opponent(s) notified when a score is reported for their match
3. **Score deadline reminder** — Players reminded when score submission deadline is approaching (e.g., 24 hours before)
4. **Tournament phase change** — All registered players notified when tournament advances (e.g., "Group stage complete, knockout starting")

Additional player notifications:
- Magic link token sent to player for registration/login
- Doubles partner consent email (for doubles tournaments)
- Co-organizer invitation email

### Organizer Notifications
- **Real-time in-app dashboard**: Organizer views all tournament activity (score submissions, withdrawals, match completions) via the live dashboard
- **No email notifications**: Organizer does not receive email notifications for tournament events (to avoid email spam)
- **WebSocket updates**: Dashboard updates in real-time as events occur

## Technology Stack

| Layer | Choice | Rationale |
|---|---|---|
| Frontend | React + Vite | Static bundle, 100% CDN-cacheable; fast build |
| Frontend Hosting | Cloudflare Pages | Global CDN, free tier, instant deploys |
| Backend | Node.js + Fastify + TypeScript | Stateless API, horizontally scalable; shared types with frontend |
| Backend Hosting | Railway or Fly.io | Easy horizontal scaling, no cold starts |
| Database | PostgreSQL | Relational, strong for complex standings and bracket queries |
| Connection Pooling | PgBouncer | Connection pooling from day one (required at 10K+ concurrent) |
| Cache / Sessions | Redis | Magic link tokens (TTL-based), session storage, hot tournament data |
| ORM | Prisma | TypeScript-native, good migrations, schema management |
| Email Delivery | Resend | Developer-friendly, reliable deliverability |
| Email Queue | BullMQ + Redis | Async email delivery, automatic retry logic, prevents request blocking |
| Monorepo | pnpm workspaces | Shared types package between frontend and backend |

## Organizer Features & Workflows

### Account Management
- **Signup**: Open signup — anyone can create an organizer account with email + password
- **Password reset**: Email reset link sent to organizer; link has time limit and resets password via one-time link
- **Co-organizer access**: Tournament creator can invite other organizers via email; invitee must accept and have/create an organizer account

### Tournament Management
- **Draft mode**: Organizer can create tournaments in draft state before publishing
- **Publication**: Once published, tournament appears in public tournament listing and registration opens
- **Tournament sharing**: Organizer gets a unique shareable URL; they manually copy and share it (via email, Slack, website, etc.)

### Tournament Admin Features
- **Bracket approval**: Organizer reviews generated bracket before revealing to players; can adjust seeding/byes
- **Score override**: Organizer can override any score at any time with a note
- **Match management**: Organizer handles unreported matches (cancel, bye, or override)
- **Real-time dashboard**: Live activity feed showing all scores, withdrawals, and match completions via WebSocket updates
- **Phase control**: Organizer can manually advance phases before scheduled dates if conditions are met

### Analytics & Reporting
Organizers can access the following reports:
- **Participation stats**: Number of registered players, registration rate, withdrawals, concurrent tournament participation
- **Match completion rate**: Number of submitted scores vs. pending scores by phase
- **Performance breakdown**: Player rankings, win rates, average set differential
- **Email delivery logs**: Which notifications were sent, delivery failures, bounces

## Real-Time Updates

- **Technology**: WebSocket-based real-time updates
- **Organizer dashboard**: Updates in real-time as tournament events occur (scores submitted, withdrawals, phase changes)
- **Player views**: Group standings and bracket updates visible to players in real-time
- **Why WebSocket**: Enables responsive UX for web and is foundation for future mobile app

## Data Management

### Data Retention
- **Active tournaments**: Kept in the system indefinitely while active
- **Completed tournaments**: Kept live (searchable, publicly viewable) for 6-12 months after completion
- **Archive**: After 6-12 months, tournaments are archived (moved to cold storage or deleted)
- **Player data**: Player registrations associated with archived tournaments are also archived

### Doubles Record Tracking
- **Shared team record**: In doubles tournaments, each team (pair) has a single win/loss and sets won record
- **Both players advance/are eliminated together**: Team seeding and advancement decisions apply to both players equally

## Accessibility

- **WCAG 2.1 AA compliance**: All user-facing pages and components meet WCAG 2.1 Level AA accessibility standards
- **Requirements**: Keyboard navigation, screen reader support, sufficient color contrast, form labels, error messages

## Scale & Performance Targets

- **Designed for**: 10,000+ concurrent requests
- **Architecture approach**: Stateless API enables horizontal scaling; connection pooling eliminates database bottleneck
- **Caching strategy**: 
  - Content-hashed static assets with long browser cache TTLs
  - Short HTTP cache-control headers (30–60s) on public tournament/bracket endpoints
  - Redis for session tokens (no DB lookup per request)
  - Database connection pooling via PgBouncer

## Future Considerations (Not in v1)
- Double-elimination brackets
- Swiss system
- Consolation/secondary brackets
- Detailed sport-specific scoring rules
- Native mobile app (web app already optimized for mobile with responsive design; WebSocket ready for mobile)
- Player ranking/seeding across tournaments (needed for balanced group distribution in v2+)
- Advanced scheduling features (court assignments, time slots for matches)
- Player API/developer access for third-party integrations
- Custom tournament branding per organizer
