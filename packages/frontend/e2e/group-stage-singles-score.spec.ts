import { test, expect, Page } from '@playwright/test'
import { getOrganizerToken, createSinglesTournamentInGroupStage } from './fixtures'

/**
 * E2E: Tournament Participation — Group Stage (Singles), score submission.
 *
 * Covers the documented scenarios in e2e-scenarios.md:
 *   - "User submits score for completed match (Singles)"
 *   - "User cannot submit score after deadline"
 *   - "User cannot submit an invalid (tied) score"
 *   - "User can edit a previously submitted score"
 *
 * The "duplicate" scenario is covered in the ScoreSubmitForm unit test (the UI
 * flips to an Edit affordance once a match is completed, so a second POST is
 * not reachable through the happy path).
 *
 * Scores are real game scores per the parser ('games-games, ...', best-of-3,
 * pickleball max 21). Each test seeds its own tournament for isolation.
 */
test.describe('Group Stage Singles - Score submission', () => {
  let organizerToken: string

  test.beforeAll(async () => {
    organizerToken = await getOrganizerToken()
  })

  async function setup(page: Page, opts: { pastGroupDeadline?: boolean } = {}) {
    const fixture = await createSinglesTournamentInGroupStage(organizerToken, 2, opts)
    await page.addInitScript(token => {
      localStorage.setItem('auth_token', token as string)
    }, fixture.playerToken)
    await page.goto(`/tournament/${fixture.tournamentId}/matches`)
    return fixture
  }

  test('player submits a valid score for a pending match', async ({ page }) => {
    await setup(page)

    await page.getByTestId('submit-score-button').first().click()
    await expect(page.getByTestId('score-submit-form')).toBeVisible()

    await page.getByTestId('score-input').fill('11-9, 11-7')
    await page.getByTestId('score-submit').click()

    // Form closes and the match now shows the submitted score
    await expect(page.getByTestId('score-submit-form')).toBeHidden()
    await expect(page.getByText('11-9, 11-7')).toBeVisible()
  })

  test('player cannot submit a tied/invalid score', async ({ page }) => {
    await setup(page)

    await page.getByTestId('submit-score-button').first().click()
    await page.getByTestId('score-input').fill('11-11, 11-7')
    await page.getByTestId('score-submit').click()

    await expect(page.getByTestId('score-error')).toBeVisible()
    // Form stays open so the player can correct it
    await expect(page.getByTestId('score-submit-form')).toBeVisible()
  })

  test('player cannot submit a score after the deadline', async ({ page }) => {
    await setup(page, { pastGroupDeadline: true })

    await page.getByTestId('submit-score-button').first().click()
    await page.getByTestId('score-input').fill('11-9, 11-7')
    await page.getByTestId('score-submit').click()

    await expect(page.getByTestId('score-error')).toContainText(/deadline/i)
  })

  test('player can edit a previously submitted score', async ({ page }) => {
    await setup(page)

    // Submit an initial score
    await page.getByTestId('submit-score-button').first().click()
    await page.getByTestId('score-input').fill('11-9, 11-7')
    await page.getByTestId('score-submit').click()
    await expect(page.getByText('11-9, 11-7')).toBeVisible()

    // Edit it to a new valid score
    await page.getByTestId('edit-score-button').first().click()
    await expect(page.getByTestId('score-submit-form')).toBeVisible()
    await page.getByTestId('score-input').fill('11-9, 11-5')
    await page.getByTestId('score-submit').click()

    await expect(page.getByText('11-9, 11-5')).toBeVisible()
  })
})
