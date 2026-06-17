import { test, expect } from '@playwright/test'
import {
  apiCall,
  getOrganizerToken,
  createTestTournament,
  createTestUser,
  createDoublesTournamentWithSoloRegistrants,
} from './fixtures'
import { API_ENDPOINTS } from './config'

/**
 * E2E: Organizer Tournament Management screen.
 *
 * Covers e2e-scenarios.md "Organizer Tournament Management": close registration,
 * create groups (+ pairUnpaired), advance stages, generate+publish bracket,
 * non-owner blocked, and the Manage entry-point link. The organizer authenticates
 * with an account JWT injected into localStorage.
 */
test.describe('Organizer Tournament Management', () => {
  let organizerToken: string

  test.beforeAll(async () => {
    organizerToken = await getOrganizerToken()
  })

  async function injectToken(page: any, token: string) {
    await page.addInitScript((t: string) => localStorage.setItem('auth_token', t), token)
  }

  test('organizer walks a doubles tournament through the full lifecycle', async ({ page }) => {
    // Create a draft doubles tournament owned by the organizer
    const create = await apiCall(
      API_ENDPOINTS.TOURNAMENTS.CREATE,
      'POST',
      { ...createTestTournament(), matchFormat: 'doubles' },
      organizerToken
    )
    expect(create.ok).toBeTruthy()
    const { id: tournamentId } = await create.json()

    await injectToken(page, organizerToken)
    await page.goto(`/tournament/${tournamentId}/manage`)

    // draft → open registration
    await page.getByTestId('open-registration-button').click()
    await expect(page.getByTestId('close-registration-button')).toBeVisible()

    // Register 4 solo players while registration is open
    for (let i = 0; i < 4; i++) {
      const u = createTestUser()
      const r = await apiCall(`/tournaments/${tournamentId}/register`, 'POST', { email: u.email, name: u.name })
      expect(r.ok).toBeTruthy()
    }

    // registration_open → close
    await page.getByTestId('close-registration-button').click()
    await expect(page.getByTestId('create-groups-form')).toBeVisible()

    // registration_closed → create groups (1 group, top 1 advances; auto-pair leftover solos)
    await page.getByTestId('num-groups-input').fill('1')
    await page.getByTestId('advancing-input').fill('1')
    await page.getByTestId('create-groups-submit').click()
    await expect(page.getByTestId('complete-group-stage-button')).toBeVisible()

    // group_stage_active → complete (scores pending → GUARD_FAILED → force)
    await page.getByTestId('complete-group-stage-button').click()
    await page.getByTestId('force-advance-button').click()
    await expect(page.getByTestId('generate-bracket-button')).toBeVisible()

    // group_stage_complete → generate + publish bracket → knockout_active
    await page.getByTestId('generate-bracket-button').click()
    await expect(page.getByTestId('complete-tournament-button')).toBeVisible()

    // knockout_active → complete (scores pending → GUARD_FAILED → force) → complete
    await page.getByTestId('complete-tournament-button').click()
    await page.getByTestId('force-advance-button').click()
    await expect(page.getByTestId('manage-status')).toContainText('tournament_complete')
  })

  test('non-owner cannot operate the controls', async ({ page }) => {
    const { tournamentId, players } = await createDoublesTournamentWithSoloRegistrants(organizerToken, 2)
    await injectToken(page, players[0].token) // a player session, not the creator
    await page.goto(`/tournament/${tournamentId}/manage`)
    await expect(page.getByTestId('not-authorized')).toBeVisible()
    await expect(page.getByTestId('close-registration-button')).toHaveCount(0)
  })

  test('Manage link routes the owner from the tournament view to the management screen', async ({ page }) => {
    const create = await apiCall(
      API_ENDPOINTS.TOURNAMENTS.CREATE,
      'POST',
      { ...createTestTournament(), matchFormat: 'singles' },
      organizerToken
    )
    const { id: tournamentId } = await create.json()

    await injectToken(page, organizerToken)
    await page.goto(`/tournament/${tournamentId}/details`)
    await page.getByTestId('manage-link').click()
    await expect(page).toHaveURL(new RegExp(`/tournament/${tournamentId}/manage`))
  })
})
