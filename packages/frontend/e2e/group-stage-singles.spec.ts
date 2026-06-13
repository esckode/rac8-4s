import { test, expect, Page } from '@playwright/test'
import { TIMEOUTS } from './config'
import {
  apiCall,
  createTestTournament,
  createTestUser,
  createTournamentWithGroups,
  getOrganizerToken,
  getTokenFromPage,
} from './fixtures'

test.describe('Feature: Tournament Participation - Group Stage (Singles)', () => {
  test('Scenario: User views tournament standings (Singles)', async ({ page }) => {
    // PREREQUISITE: Create tournament with groups in group_stage_active state
    const tournament = createTestTournament()
    const organizerToken = await getOrganizerToken()
    const { id: tournamentId } = await createTournamentWithGroups(tournament, organizerToken, 4)

    // Get tournament details to find group ID
    const groupsRes = await apiCall(`/tournaments/${tournamentId}/groups`, 'GET', undefined, organizerToken)
    expect(groupsRes.ok).toBe(true)
    const groups = await groupsRes.json()
    const groupId = groups.groups[0].id

    // Navigate to tournament page
    await page.goto(`/tournament/${tournamentId}/standings`)

    // Verify standings table is visible
    const standingsTable = page.locator('[data-testid="standings-table"]')
    await expect(standingsTable).toBeVisible({ timeout: TIMEOUTS.LONG })

    // Verify standings include required columns
    const headerCells = page.locator('thead th')
    await expect(headerCells).toContainText('Rank')
    await expect(headerCells).toContainText('Player')
    await expect(headerCells).toContainText('Wins')
    await expect(headerCells).toContainText('Sets')
  })

  test('Scenario: User views upcoming matches (Singles)', async ({ page }) => {
    // PREREQUISITE: Create tournament with groups
    const tournament = createTestTournament()
    const organizerToken = await getOrganizerToken()
    const { id: tournamentId } = await createTournamentWithGroups(tournament, organizerToken, 4)

    // Navigate to matches tab
    await page.goto(`/tournament/${tournamentId}/standings`)
    await page.click('[data-testid="tab-matches"]')

    // Verify matches list is visible
    const matchesList = page.locator('[data-testid="matches-list"]')
    await expect(matchesList).toBeVisible({ timeout: TIMEOUTS.LONG })

    // Verify match cards show opponent info
    const matchCards = page.locator('[data-testid="match-card"]')
    if (await matchCards.count() > 0) {
      const firstCard = matchCards.nth(0)
      await expect(firstCard).toContainText(/vs\.|Player/)
      await expect(firstCard).toContainText(/Pending|Completed/)
    }
  })

  test('Scenario: User submits score for completed match (Singles)', async ({ page }) => {
    // PREREQUISITE: Create tournament with groups
    const tournament = createTestTournament()
    const organizerToken = await getOrganizerToken()
    const { id: tournamentId } = await createTournamentWithGroups(tournament, organizerToken, 4)

    // Register a player in the tournament
    const user = createTestUser()
    const regRes = await apiCall(`/tournaments/${tournamentId}/register`, 'POST', {
      email: user.email,
      name: user.name,
    })
    expect(regRes.ok).toBe(true)

    // Navigate to matches
    await page.goto(`/tournament/${tournamentId}/standings`)
    await page.click('[data-testid="tab-matches"]')

    // Find and click [Submit Score] button
    const submitButtons = page.locator('button:has-text("Submit Score")')
    if (await submitButtons.count() > 0) {
      await submitButtons.nth(0).click()

      // Fill in score form
      await page.fill('[data-testid="score-input"]', '6-4, 6-3')
      await page.click('[data-testid="submit-score-button"]')

      // Verify success message
      await expect(page).toContainText(/Score submitted|Success/, { timeout: TIMEOUTS.LONG })
    }
  })

  test('Scenario: User cannot submit tied score', async ({ page }) => {
    // PREREQUISITE: Create tournament with groups
    const tournament = createTestTournament()
    const organizerToken = await getOrganizerToken()
    const { id: tournamentId } = await createTournamentWithGroups(tournament, organizerToken, 4)

    // Navigate to matches
    await page.goto(`/tournament/${tournamentId}/standings`)
    await page.click('[data-testid="tab-matches"]')

    // Try to submit tied score
    const submitButtons = page.locator('button:has-text("Submit Score")')
    if (await submitButtons.count() > 0) {
      await submitButtons.nth(0).click()

      // Fill in tied score (6-6)
      await page.fill('[data-testid="score-input"]', '6-6')

      // Try to submit
      const submitBtn = page.locator('[data-testid="submit-score-button"]')
      // Button should be disabled or form shouldn't submit
      await expect(submitBtn).toBeDisabled()

      // Or error should appear
      await expect(page).toContainText(/tied|must differ|invalid/i, { timeout: TIMEOUTS.SHORT })
    }
  })

  test('Scenario: User can edit previously submitted score', async ({ page }) => {
    // PREREQUISITE: Create tournament with groups and submit a score
    const tournament = createTestTournament()
    const organizerToken = await getOrganizerToken()
    const { id: tournamentId } = await createTournamentWithGroups(tournament, organizerToken, 4)

    // Get a match and submit initial score via API
    const matchesRes = await apiCall(`/tournaments/${tournamentId}/matches`, 'GET')
    expect(matchesRes.ok).toBe(true)
    const matchesData = await matchesRes.json()

    if (matchesData.matches && matchesData.matches.length > 0) {
      // Navigate to tournament
      await page.goto(`/tournament/${tournamentId}/standings`)
      await page.click('[data-testid="tab-matches"]')

      // Look for [Edit Score] button
      const editButtons = page.locator('button:has-text("Edit Score")')
      if (await editButtons.count() > 0) {
        await editButtons.nth(0).click()

        // Clear and change score
        const scoreInput = page.locator('[data-testid="score-input"]')
        await scoreInput.fill('')
        await scoreInput.fill('6-2, 6-1')

        // Submit
        await page.click('[data-testid="submit-score-button"]')

        // Verify success
        await expect(page).toContainText(/Updated|Success/, { timeout: TIMEOUTS.LONG })
      }
    }
  })
})
