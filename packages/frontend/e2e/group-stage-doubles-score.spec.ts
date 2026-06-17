import { test, expect, Page } from '@playwright/test'
import { getOrganizerToken, createDoublesTournamentInGroupStage } from './fixtures'

/**
 * E2E: Tournament Participation — Group Stage (Doubles), score submission.
 *
 * Validates that the score form works for a team-vs-team match: a player on a
 * team submits and edits the score with their magic-link player session. The
 * backend resolves the winning team and verifies team membership.
 */
test.describe('Group Stage Doubles - Score submission', () => {
  let organizerToken: string

  test.beforeAll(async () => {
    organizerToken = await getOrganizerToken()
  })

  async function setup(page: Page) {
    const fixture = await createDoublesTournamentInGroupStage(organizerToken, 4)
    await page.addInitScript(token => {
      localStorage.setItem('auth_token', token as string)
    }, fixture.playerToken)
    await page.goto(`/tournament/${fixture.tournamentId}/matches`)
    return fixture
  }

  test('a team member submits a valid score for a pending doubles match', async ({ page }) => {
    await setup(page)

    await page.getByTestId('submit-score-button').first().click()
    await expect(page.getByTestId('score-submit-form')).toBeVisible()

    await page.getByTestId('score-input').fill('11-9, 11-7')
    await page.getByTestId('score-submit').click()

    await expect(page.getByTestId('score-submit-form')).toBeHidden()
    await expect(page.getByText('11-9, 11-7')).toBeVisible()
  })

  test('a team member can edit a previously submitted doubles score', async ({ page }) => {
    await setup(page)

    await page.getByTestId('submit-score-button').first().click()
    await page.getByTestId('score-input').fill('11-9, 11-7')
    await page.getByTestId('score-submit').click()
    await expect(page.getByText('11-9, 11-7')).toBeVisible()

    await page.getByTestId('edit-score-button').first().click()
    await expect(page.getByTestId('score-submit-form')).toBeVisible()
    await page.getByTestId('score-input').fill('11-9, 11-5')
    await page.getByTestId('score-submit').click()

    await expect(page.getByText('11-9, 11-5')).toBeVisible()
  })
})
