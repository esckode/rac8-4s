# Design Flow Changes for Doubles Implementation

**Document Version:** 1.0  
**Status:** Design Review  
**Scope:** Updates to rac8-4s-HL.md design flows

---

## Overview

The HL document's UX design flows contain singles-specific language and examples that need updates to accurately represent doubles tournaments. This document identifies all necessary changes.

**Affected Flows:**
1. ✅ Authentication Flow — No changes
2. ⚠️ Tournament Discovery & Registration — **Minor updates**
3. ⚠️ Tournament Participation — **Major updates (new flow section)**
4. ⚠️ Mobile Layout — **Minor updates**
5. ✅ Real-Time Update Flow — No changes (already generic)
6. ✅ Error Handling & Recovery — No changes (already generic)

---

## Flow 1: Authentication Flow

**Status:** ✅ No changes needed

**Rationale:** Authentication is identical for both singles and doubles. Sign up, login, and password reset flows work the same whether registering for a singles or doubles tournament.

---

## Flow 2: Tournament Discovery & Registration

**Status:** ⚠️ Requires updates

### Issue 2.1: Tournament Card - Participant Count Display

**Current (Line 254):**
```
│   ├─ Max players, registered count
```

**Required Change:**
Should display count differently based on format:
```
│   ├─ Max players: X
│   ├─ Registered: Y (players for singles / teams for doubles)
```

**Location:** Tournament List Card description

---

### Issue 2.2: Tournament Detail Page - Participant Count

**Current (Line 269):**
```
│  Registered: 12/16 players
```

**Required Change for doubles:**
```
│  Registered: 6/8 teams (12/16 players total)
```

**Rationale:** For doubles, users care about team counts primarily, but need to know total player count for context.

**Location:** Tournament Details Page header

---

### Issue 2.3: Registration Flow - Partner Selection (NEW)

**Current:** Assumes single player registration
```
├─ User enters: email, name
├─ Backend:
│   ├─ Check deadline not passed
│   ├─ Check email not registered
│   ├─ Generate magic link token
│   ├─ Send email with link
│   └─ Return token to frontend
```

**Required New Section for Doubles Tournaments:**

For doubles tournaments, registration should include partner selection:

```
DOUBLES REGISTRATION FLOW (NEW):

START: Tournament Detail Page (doubles format)
  ↓
[Registration Section]
├─ User enters: email, name
├─ User selects: Partner (from dropdown or invite)
│   ├─ Option A: Select registered partner
│   │   └─ Backend sends confirmation email to partner
│   │       └─ Partner confirms: /registrations/:id/confirm
│   │           └─ Both confirmed → ready for group stage
│   │
│   └─ Option B: Invite partner by email
│       └─ Backend sends invite link to partner
│           └─ Partner creates account + confirms → ready
│
├─ Backend:
│   ├─ Check deadline not passed (409 if passed)
│   ├─ Check email not registered (409 if exists)
│   ├─ Check partner_id is valid and different player (409 if invalid)
│   ├─ Create partnership record (partner_id + partner_confirmed=false)
│   ├─ Send confirmation email to partner
│   ├─ Generate magic link token for self (24-hour TTL)
│   ├─ Send registration link to self
│   └─ Return token to frontend
│
└─ Registration Status: "Pending Partner Confirmation"
   └─ Partner receives email: "Confirm team with [Your Name]"
      └─ Partner clicks link → /registrations/:id/confirm
         └─ Backend: mark partner_confirmed=true
         └─ Both players now registered as team
```

**New Flow State:** After registration, partners see:
- "Your team is ready for group stage" (if both confirmed)
- "Waiting for partner confirmation" (if partner not confirmed)

---

## Flow 2.5: Partner Confirmation (NEW - Doubles Only)

**Status:** ⚠️ **New flow - must be designed and implemented**

This is a critical new user journey for doubles tournaments that does not exist in current flows.

### Partner Selection & Confirmation Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│            DOUBLES PARTNER SELECTION & CONFIRMATION FLOW             │
└─────────────────────────────────────────────────────────────────────┘

ENTRY POINT: Tournament Detail Page (doubles format)
/tournament/:id/browse
┌──────────────────────────────────────────────────────┐
│  Tournament Name                                [←Back]│
│  Sport: Pickleball | Format: Doubles                 │
│  Status: Registration Open                           │
│  Deadline: June 15, 2026 at 5:00 PM                  │
│  Registered Teams: 6/8 teams (12/16 players)         │
├──────────────────────────────────────────────────────┤
│  REGISTRATION SECTION (for unauthenticated users)    │
│                                                      │
│  [Already have an account? Sign In]                  │
│                                                      │
│  OR register as a team:                              │
│  Email: [___________________]                        │
│  Name:  [___________________]                        │
│                                                      │
│  Partner Selection:                                  │
│  ┌─ Option A: [Select from existing players ▼]      │
│  │  Shows list of registered players for this        │
│  │  tournament who aren't yet on a team              │
│  │                                                   │
│  └─ Option B: [Invite partner by email]              │
│     [Enter partner email _______________]            │
│     └─ Partner must accept to confirm team           │
│                                                      │
│  [Register as Team]                                  │
├──────────────────────────────────────────────────────┤
│  Details | Rules | Venue | Contact                  │
└──────────────────────────────────────────────────────┘

REGISTRATION FLOW (NEW STEPS):

SCENARIO A: Select from existing players
├─ User enters: email, name
├─ User selects: partner from dropdown
├─ Backend:
│   ├─ Check deadline not passed (409 if passed)
│   ├─ Check email not registered (409 if exists)
│   ├─ Validate partner_id is different and registered (409 if invalid)
│   ├─ Create team record
│   ├─ Create player_registrations for self: partner_id set, partner_confirmed=false
│   ├─ Create player_registrations for partner: mirror record
│   ├─ Send email to partner: "You've been paired with [Your Name]"
│   │   └─ Email contains confirmation link
│   ├─ Generate magic link token for self (24-hour TTL)
│   ├─ Send email to self: "Confirm your team with [Partner Name]"
│   └─ Return token to frontend
│
└─ User sees: "Team pending partner confirmation"
   └─ States shown until both confirm:
      ├─ "Waiting for your confirmation" (link in email)
      └─ "Waiting for [Partner Name]'s confirmation"

SCENARIO B: Invite partner by email
├─ User enters: email, name, partner email
├─ Backend:
│   ├─ Check deadline not passed (409 if passed)
│   ├─ Check email not registered (409 if exists)
│   ├─ Check partner email is valid format (400 if invalid)
│   ├─ Check partner email not same as self (400 if same)
│   ├─ Generate magic link token for self
│   ├─ Send email to self: "Complete registration and confirm team"
│   ├─ Send email to partner: "You've been invited to team with [Your Name]"
│   │   └─ Email contains link: /signup?token=partner_invite_token
│   │       └─ Token is valid for 7 days
│   │       └─ Clicking link takes partner to:
│   │           /signup?token=xxx (pre-fill email from token)
│   │           └─ Partner creates account + auto-confirms as partner
│   └─ Return token to frontend
│
└─ User sees: "Waiting for partner to accept invitation"
   └─ Partner receives email:
      "You've been invited to join [Tournament Name] as [Your Name]'s partner"
      [Accept & Create Account] button
        └─ Clicking takes to signup page
        └─ Partner creates account
        └─ Partner automatically confirmed as team member

PARTNER CONFIRMATION FLOW:

User clicks confirmation link in email
  → /registrations/:registrationId/confirm (GET or POST?)
    ↓
Backend: Mark partner_confirmed=true
  ├─ Query: player_registrations WHERE id=:registrationId
  ├─ Update: partner_confirmed=true, confirmed_at=NOW()
  ├─ Check if both players confirmed
  │   ├─ If yes: team is ready for group stage
  │   └─ If no: still waiting on other player
  └─ Return 200 OK
    ↓
Frontend: Show "Team confirmed! You're ready for group stage"
  ├─ Auto-redirect to /tournament/:id/standings after 3 seconds
  └─ If both confirmed, show ready badge on team

STATES DURING REGISTRATION:

Before any confirmation:
  Status: "pending_partner_confirm"
  Display: "⏳ Waiting for confirmation from [Player Name]"

After both confirm:
  Status: "registered"
  Display: "✓ Team ready for group stage"

If partner hasn't confirmed by deadline:
  Status: "registration_incomplete"
  Display: "❌ Partnership not confirmed - team not eligible"
  Action: Can cancel registration and try with different partner

ERROR SCENARIOS:

├─ Partner email doesn't exist (Scenario B)
│   └─ "Partner must accept invitation before deadline"
│   └─ Display: "Waiting for [email] to accept invitation"
│   └─ Resend option: "Send invitation again"
│
├─ Partner declines (NEW endpoint needed)
│   └─ POST /registrations/:id/decline
│   └─ Display: "Partnership declined - register with different partner"
│   └─ Option: "Find another partner"
│
└─ Deadline passed while waiting
    └─ "Registration deadline passed"
    └─ Cannot register anymore

CONFIRMATION EMAIL EXAMPLES:

TEMPLATE 1: You've been paired
═════════════════════════════════
To: partner@example.com
Subject: Confirm your team for [Tournament Name]

Hi [Partner Name],

[Your Name] has paired you for doubles in [Tournament Name]!

To confirm your partnership, click the link below:
[Confirmation Link with 24-hour TTL]

If you're not interested, you can ignore this email.

─
Deadline: [Date/Time]
─

TEMPLATE 2: You've been invited
═════════════════════════════════
To: partner@example.com
Subject: Team invitation for [Tournament Name]

Hi there,

[Your Name] has invited you to join their team for [Tournament Name]!

To accept and create your account:
[Signup Link with 7-day TTL, pre-filled email]

After signing up, you'll automatically be confirmed as their partner.

─
Deadline: [Date/Time]
─
```

### Issue 2.5: Team Confirmation Status Display

**New Page:** `/registrations/:registrationId/confirm`

**Purpose:** Shows partner confirmation status after clicking email link

**Scenarios:**

```
Scenario 1: First partner confirms
┌────────────────────────────────────────┐
│  Team Confirmation                [←Back]
├────────────────────────────────────────┤
│                                        │
│  ✓ Your partnership confirmed!        │
│                                        │
│  Team: [Your Name] & [Partner Name]   │
│  Tournament: [Tournament Name]         │
│  Status: Pending partner confirmation │
│                                        │
│  [Watch for partner to confirm...]    │
│  (Auto-refresh every 10 seconds)      │
│                                        │
│  Redirecting to tournament...          │
│                                        │
└────────────────────────────────────────┘

Scenario 2: Both partners confirm
┌────────────────────────────────────────┐
│  Team Confirmation                [←Back]
├────────────────────────────────────────┤
│                                        │
│  ✓ Partnership complete!              │
│                                        │
│  Team: [Your Name] & [Partner Name]   │
│  Tournament: [Tournament Name]         │
│  Status: ✓ Ready for group stage      │
│                                        │
│  Your team is eligible for the        │
│  upcoming group stage!                │
│                                        │
│  [Go to tournament]                   │
│                                        │
└────────────────────────────────────────┘

Scenario 3: Partner hasn't confirmed yet
┌────────────────────────────────────────┐
│  Team Confirmation                [←Back]
├────────────────────────────────────────┤
│                                        │
│  ✓ Your confirmation received         │
│                                        │
│  Team: [Your Name] & [Partner Name]   │
│  Tournament: [Tournament Name]         │
│                                        │
│  Waiting for [Partner Name] to       │
│  confirm...                           │
│                                        │
│  [Resend confirmation email]          │
│                                        │
│  Deadline: [Date/Time]                │
│                                        │
└────────────────────────────────────────┘
```

---

## Flow 3: Tournament Participation & Score Submission

**Status:** ⚠️ Requires major updates

### Issue 3.1: Tournament Detail Page - Group Context

**Current (Line 317):**
```
│  Your Group: Group 1 (4 players)
```

**Required Change for doubles:**
```
│  Your Group: Group 1 (4 teams / 8 players)
```

---

### Issue 3.2: Standings Table - Column Headers & Data

**Current (Lines 322-327):**
```
│  │ Rank | Name          | Wins | Losses | Sets W | Sets L | +/- │
│  ├─────────────────────────────────────────────────────────────┤  │
│  │  1   | Alice Davis   │  2   │  0     │  4    │  1    │ +3  │  │
│  │  2   | Bob Miller    │  1   │  1     │  3    │  2    │ +1  │  │
│  │  3   | Charlie Smith │  1   │  1     │  3    │  3    │  0  │  │
│  │  4   | Diana Brown   │  0   │  2     │  1    │  4    │ -3  │  │
```

**Required Change for doubles (new example):**
```
│  │ Rank | Team                | Wins | Losses | Sets W | Sets L | +/- │
│  ├─────────────────────────────────────────────────────────────────┤  │
│  │  1   | Alice & Bob         │  2   │  0     │  4    │  1    │ +3  │  │
│  │  2   | Charlie & Diana     │  1   │  1     │  3    │  2    │ +1  │  │
│  │  3   | Eve & Frank         │  1   │  1     │  3    │  3    │  0  │  │
│  │  4   | Grace & Henry       │  0   │  2     │  1    │  4    │ -3  │  │
```

---

### Issue 3.3: Matches Tab - Match Card Examples

**Current (Lines 339-354):**
```
├─ Your Upcoming Matches
│   ├─ Match Card #1
│   │   ├─ vs. Bob Miller
│   │   ├─ Group 1, Round-Robin
│   │   ├─ Status: Pending
│   │   └─ [Submit Score] button
│   │
│   ├─ Match Card #2
│   │   ├─ vs. Charlie Smith
│   │   ├─ Status: Pending
│   │   └─ [Submit Score] button
│   │
│   ├─ Match Card #3 (Completed)
│   │   ├─ vs. Diana Brown
│   │   ├─ Score: You won 2-1
│   │   ├─ Status: Completed
│   │   └─ [Edit Score] button (organizer only)
```

**Required Change for doubles (new example):**
```
├─ Your Upcoming Matches
│   ├─ Match Card #1
│   │   ├─ (You & Bob) vs. (Charlie & Diana)
│   │   ├─ Group 1, Round-Robin
│   │   ├─ Status: Pending
│   │   └─ [Submit Score] button
│   │
│   ├─ Match Card #2
│   │   ├─ (You & Bob) vs. (Eve & Frank)
│   │   ├─ Status: Pending
│   │   └─ [Submit Score] button
│   │
│   ├─ Match Card #3 (Completed)
│   │   ├─ (You & Bob) vs. (Grace & Henry)
│   │   ├─ Score: Your team won 2-1
│   │   ├─ Status: Completed
│   │   └─ [Edit Score] button (organizer only)
```

---

### Issue 3.4: Score Submission Modal - Labels

**Current (Lines 357-376):**
```
SCORE SUBMISSION MODAL
┌─────────────────────────────────┐
│  Submit Score                   [X] │
├─────────────────────────────────┤
│                                     │
│  You vs. Bob Miller                 │
│                                     │
│  Score Format: "X-Y"                │
│  Example: "2-1" (you won 2, he 1)   │
│                                     │
│  Your Sets: [2▼]                    │
│  Their Sets: [1▼]                   │
│                                     │
│  [Submit] [Cancel]                  │
│                                     │
│  Validation (real-time):            │
│  ✓ Score entered                    │
│  ✓ Winner determined                │
│  ✓ Deadline not passed              │
└─────────────────────────────────┘
```

**Required Change for doubles:**
```
SCORE SUBMISSION MODAL (DOUBLES)
┌─────────────────────────────────┐
│  Submit Score                   [X] │
├─────────────────────────────────┤
│                                     │
│  (You & Bob) vs. (Charlie & Diana)  │
│                                     │
│  Score Format: "X-Y"                │
│  Example: "2-1" (your team 2 sets, │
│           their team 1 set)         │
│                                     │
│  Your Team Sets: [2▼]               │
│  Other Team Sets: [1▼]              │
│                                     │
│  [Submit] [Cancel]                  │
│                                     │
│  Validation (real-time):            │
│  ✓ Score entered                    │
│  ✓ Winner determined                │
│  ✓ Deadline not passed              │
└─────────────────────────────────┘
```

---

### Issue 3.5: Bracket Tab - Bracket Examples

**Current (Lines 413-420):**
```
   ├─ BRACKET TREE
   │  └─ Semifinals
   │     ├─ (1) Alice vs (4) Diana    [Pending]
   │     └─ (2) Bob vs (3) Charlie    [Pending]
   │
   ├─ Finals
   │  └─ Winner A vs Winner B         [Pending]
   │
   └─ Real-time updates via SSE
      └─ Match scores and bracket structure update live
```

**Required Change for doubles:**
```
   ├─ BRACKET TREE
   │  └─ Semifinals
   │     ├─ (1) Alice & Bob vs (4) Grace & Henry       [Pending]
   │     └─ (2) Charlie & Diana vs (3) Eve & Frank     [Pending]
   │
   ├─ Finals
   │  └─ Winner A vs Winner B                          [Pending]
   │
   └─ Real-time updates via SSE
      └─ Match scores and bracket structure update live
```

---

## Flow 4: Mobile Layout

**Status:** ⚠️ Requires minor updates

### Issue 4.1: Standings Table - Columns

**Current (Lines 448-449):**
```
│  Standings Table (Virtualized)  │
│  - Horizontal scroll if needed  │
│  - Rank | Name | Wins | Loss    │
│  - Touch-friendly row height    │
```

**Required Change for doubles:**
```
│  Standings Table (Virtualized)  │
│  - Horizontal scroll if needed  │
│  - Rank | Team | Wins | Loss    │  (for doubles)
│  - Rank | Name | Wins | Loss    │  (for singles)
│  - Touch-friendly row height    │
│  - Teams show player names:     │
│    "Player1 & Player2"          │
```

---

### Issue 4.2: Form Layout - Doubles Registration

**Current:** Only shows single player signup form

**Required Addition:** Add doubles-specific registration form example

```
[Doubles Registration Page Example]
┌─────────────────────────────────┐
│  Register for Tournament      [X]│
├─────────────────────────────────┤
│                                 │
│  Email                          │
│  [_____________________________] │
│                                 │
│  Name                           │
│  [_____________________________] │
│  Min 2 characters               │
│                                 │
│  Partner                        │
│  [Select partner ▼]             │
│  OR                             │
│  [Invite by email]              │
│  [_____________________________] │
│                                 │
│  [Register Team ▶] (full width) │
│  [Cancel]                       │
│                                 │
└─────────────────────────────────┘

Form Validation:
├─ Email: valid format
├─ Name: min 2 characters
├─ Partner: different from self
└─ Partner: exists or invite valid
```

---

## Flow 5: Real-Time Update Flow

**Status:** ✅ No changes needed

**Rationale:** The SSE update flow is completely generic — it works with any participant ID (player or team). The algorithm and data flow are identical.

---

## Flow 6: Error Handling & Recovery

**Status:** ✅ No changes needed

**Rationale:** Error scenarios (offline, timeout, validation, rate limit) are all independent of participant type. All flows work the same for singles and doubles.

---

## Summary of Changes Required

| Flow | Type | Changes | Effort |
|------|------|---------|--------|
| Authentication | ✅ No changes | — | 0 |
| Discovery & Registration | ⚠️ Minor updates | Participant count labels, partner selection flow | 0.5 days |
| Participation | ⚠️ Major updates | Match examples, standings examples, bracket examples | 1 day |
| Mobile Layout | ⚠️ Minor updates | Table columns, form example | 0.5 days |
| Real-Time Updates | ✅ No changes | — | 0 |
| Error Handling | ✅ No changes | — | 0 |
| **Total** | — | — | **~2 days** |

---

## Implementation Notes

### When to Apply These Changes

These design flow updates should be applied **before or concurrently with** Phase 5 (Frontend Display) of the DoublesRequirements.md implementation plan.

**Timing:**
- These document updates: 0.5 days (editing + review)
- Can be done in parallel with Phase 5 UI implementation
- Should be finalized before QA testing begins

### How to Apply Changes

1. **Update rac8-4s-HL.md sections:**
   - Section: "Tournament Discovery & Registration"
   - Section: "Tournament Participation"
   - Section: "Mobile Layout"

2. **Add new subsection:**
   - Add "Doubles Partnership Confirmation Flow" to Registration section

3. **Add examples:**
   - Doubles standings table example
   - Doubles match card examples
   - Doubles bracket examples
   - Doubles mobile form example

### Key Design Principles for Doubles

When implementing the flow updates, follow these principles:

1. **Clarity:** Always show "Team" when displaying partner names ("Alice & Bob" not "Alice/Bob")
2. **Symmetry:** Both team members equally represented in match cards and standings
3. **Context:** Show total player count where useful (e.g., "4 teams / 8 players")
4. **Consistency:** All flows use same team naming convention
5. **Validation:** Partner confirmation required before group stage

---

## Related Documents

- **DoublesRequirements.md** — Implementation plan for doubles features
- **rac8-4s-HL.md** — Main high-level requirements (to be updated)

---

## Document Maintenance

**Document Owner:** Development Team  
**Last Updated:** 2026-06-01  
**Status:** Design Review - Awaiting HL Document Updates  
**Next Step:** Apply changes to rac8-4s-HL.md
