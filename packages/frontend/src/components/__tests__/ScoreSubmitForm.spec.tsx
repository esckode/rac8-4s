/**
 * ScoreSubmitForm — player submits or edits a match score.
 *
 * - Single text field for the real game-score string ('11-9, 11-7').
 * - Calls the API client directly with the stored session token (no auto-retry):
 *   submitScore (POST) for a pending match, editScore (PATCH) for a completed one.
 * - Maps backend ApiError.code to a friendly message; tied/invalid/deadline show
 *   immediately and keep the form open. ALREADY_SCORED offers an edit affordance.
 */
import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ScoreSubmitForm } from '../ScoreSubmitForm'
import * as apiClient from '../../api/client'

jest.mock('../../api/client')

const mockSubmitScore = apiClient.submitScore as jest.MockedFunction<typeof apiClient.submitScore>
const mockEditScore = apiClient.editScore as jest.MockedFunction<typeof apiClient.editScore>

const pendingMatch = {
  id: 'match_1',
  tournamentId: 'tourn_1',
  status: 'pending',
  score: null,
  player1Id: 'p1',
  player2Id: 'p2',
} as any

const completedMatch = {
  ...pendingMatch,
  status: 'completed',
  score: '11-9, 11-7',
} as any

function apiError(code: string) {
  return { code, message: `API error: ${code}`, status: code === 'SCORE_INVALID' ? 400 : 409 }
}

describe('ScoreSubmitForm', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    localStorage.clear()
    localStorage.setItem('auth_token', 'player-token')
  })

  it('renders a score input and submit button', () => {
    render(<ScoreSubmitForm match={pendingMatch} onSuccess={jest.fn()} onClose={jest.fn()} />)
    expect(screen.getByTestId('score-input')).toBeInTheDocument()
    expect(screen.getByTestId('score-submit')).toBeInTheDocument()
  })

  it('submits a pending match via submitScore with the stored token, then calls onSuccess', async () => {
    mockSubmitScore.mockResolvedValueOnce(undefined as any)
    const onSuccess = jest.fn()

    render(<ScoreSubmitForm match={pendingMatch} onSuccess={onSuccess} onClose={jest.fn()} />)

    fireEvent.change(screen.getByTestId('score-input'), { target: { value: '11-9, 11-7' } })
    fireEvent.click(screen.getByTestId('score-submit'))

    await waitFor(() => expect(onSuccess).toHaveBeenCalled())
    expect(mockSubmitScore).toHaveBeenCalledWith('tourn_1', 'match_1', '11-9, 11-7', 'player-token', 'group')
  })

  it('shows an error and keeps the form open on an invalid (tied) score', async () => {
    mockSubmitScore.mockRejectedValueOnce(apiError('SCORE_INVALID'))
    const onSuccess = jest.fn()

    render(<ScoreSubmitForm match={pendingMatch} onSuccess={onSuccess} onClose={jest.fn()} />)

    fireEvent.change(screen.getByTestId('score-input'), { target: { value: '11-11, 11-7' } })
    fireEvent.click(screen.getByTestId('score-submit'))

    await waitFor(() => expect(screen.getByTestId('score-error')).toBeInTheDocument())
    expect(onSuccess).not.toHaveBeenCalled()
  })

  it('shows a deadline message when the backend reports DEADLINE_PASSED', async () => {
    mockSubmitScore.mockRejectedValueOnce(apiError('DEADLINE_PASSED'))

    render(<ScoreSubmitForm match={pendingMatch} onSuccess={jest.fn()} onClose={jest.fn()} />)

    fireEvent.change(screen.getByTestId('score-input'), { target: { value: '11-9, 11-7' } })
    fireEvent.click(screen.getByTestId('score-submit'))

    await waitFor(() => expect(screen.getByTestId('score-error')).toHaveTextContent(/deadline/i))
  })

  it('offers an edit affordance when the match was ALREADY_SCORED, then edits via editScore', async () => {
    mockSubmitScore.mockRejectedValueOnce(apiError('ALREADY_SCORED'))
    mockEditScore.mockResolvedValueOnce(undefined as any)
    const onSuccess = jest.fn()

    render(<ScoreSubmitForm match={pendingMatch} onSuccess={onSuccess} onClose={jest.fn()} />)

    fireEvent.change(screen.getByTestId('score-input'), { target: { value: '11-9, 11-7' } })
    fireEvent.click(screen.getByTestId('score-submit'))

    await waitFor(() => expect(screen.getByTestId('score-error')).toHaveTextContent(/already scored/i))

    // Switch to edit mode and resubmit — now via PATCH
    fireEvent.click(screen.getByTestId('score-edit-instead'))
    fireEvent.click(screen.getByTestId('score-submit'))

    await waitFor(() => expect(onSuccess).toHaveBeenCalled())
    expect(mockEditScore).toHaveBeenCalledWith('tourn_1', 'match_1', '11-9, 11-7', 'player-token', 'group')
  })

  it('edits a completed match via editScore (PATCH), prefilled with the existing score', async () => {
    mockEditScore.mockResolvedValueOnce(undefined as any)
    const onSuccess = jest.fn()

    render(<ScoreSubmitForm match={completedMatch} onSuccess={onSuccess} onClose={jest.fn()} />)

    const input = screen.getByTestId('score-input') as HTMLInputElement
    expect(input.value).toBe('11-9, 11-7')

    fireEvent.change(input, { target: { value: '11-9, 11-5' } })
    fireEvent.click(screen.getByTestId('score-submit'))

    await waitFor(() => expect(onSuccess).toHaveBeenCalled())
    expect(mockEditScore).toHaveBeenCalledWith('tourn_1', 'match_1', '11-9, 11-5', 'player-token', 'group')
    expect(mockSubmitScore).not.toHaveBeenCalled()
  })
})
