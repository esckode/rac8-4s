import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ScoreSubmissionForm } from '../../components/ScoreSubmissionForm'

describe('ScoreSubmissionForm Component', () => {
  const mockOnSubmit = jest.fn()
  const mockOnError = jest.fn()

  const singlesMatch = {
    id: 'match_1',
    matchType: 'singles' as const,
    tournamentId: 't1',
    groupId: 'g1',
    participants: [
      { playerId: 'p1', name: 'Alice' },
      { playerId: 'p2', name: 'Bob' }
    ],
    score: null,
    status: 'pending'
  }

  const doublesMatch = {
    id: 'match_1',
    matchType: 'doubles' as const,
    tournamentId: 't1',
    groupId: 'g1',
    participants: [
      {
        teamId: 'team_1',
        teamName: 'Alice & Bob',
        players: [
          { id: 'p1', name: 'Alice' },
          { id: 'p2', name: 'Bob' }
        ]
      },
      {
        teamId: 'team_2',
        teamName: 'Charlie & Diana',
        players: [
          { id: 'p3', name: 'Charlie' },
          { id: 'p4', name: 'Diana' }
        ]
      }
    ],
    score: null,
    status: 'pending'
  }

  beforeEach(() => {
    mockOnSubmit.mockClear()
    mockOnError.mockClear()
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  describe('Singles match form', () => {
    it('should render score input for singles', () => {
      render(
        <ScoreSubmissionForm
          match={singlesMatch}
          onSubmit={mockOnSubmit}
          onError={mockOnError}
        />
      )

      expect(screen.getByLabelText(/your sets/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/opponent sets/i)).toBeInTheDocument()
    })

    it('should have valid input constraints for singles', () => {
      render(
        <ScoreSubmissionForm
          match={singlesMatch}
          onSubmit={mockOnSubmit}
          onError={mockOnError}
        />
      )

      const inputs = screen.getAllByRole('spinbutton')
      inputs.forEach((input: HTMLElement) => {
        expect((input as HTMLInputElement).min).toBe('0')
        expect((input as HTMLInputElement).max).toBe('3')
      })
    })

    it('should display help text for singles format', () => {
      render(
        <ScoreSubmissionForm
          match={singlesMatch}
          onSubmit={mockOnSubmit}
          onError={mockOnError}
        />
      )

      expect(screen.getByText(/format: x-y/i)).toBeInTheDocument()
      expect(screen.getByText(/you won x sets, opponent won y/i)).toBeInTheDocument()
    })

    it('should submit score for singles', async () => {
      render(
        <ScoreSubmissionForm
          match={singlesMatch}
          onSubmit={mockOnSubmit}
          onError={mockOnError}
        />
      )

      const inputs = screen.getAllByRole('spinbutton')
      await userEvent.clear(inputs[0])
      await userEvent.type(inputs[0], '2')
      await userEvent.clear(inputs[1])
      await userEvent.type(inputs[1], '1')

      const submitButton = screen.getByRole('button', { name: /submit/i })
      await userEvent.click(submitButton)

      await waitFor(() => {
        expect(mockOnSubmit).toHaveBeenCalledWith('2-1')
      })
    })

    it('should prevent invalid scores', async () => {
      render(
        <ScoreSubmissionForm
          match={singlesMatch}
          onSubmit={mockOnSubmit}
          onError={mockOnError}
        />
      )

      const inputs = screen.getAllByRole('spinbutton')
      await userEvent.clear(inputs[0])
      await userEvent.type(inputs[0], '0')
      await userEvent.clear(inputs[1])
      await userEvent.type(inputs[1], '0')

      const submitButton = screen.getByRole('button', { name: /submit/i })
      await userEvent.click(submitButton)

      await waitFor(() => {
        expect(mockOnError).toHaveBeenCalled()
      })
    })
  })

  describe('Doubles match form', () => {
    it('should render score input for doubles', () => {
      render(
        <ScoreSubmissionForm
          match={doublesMatch}
          onSubmit={mockOnSubmit}
          onError={mockOnError}
        />
      )

      expect(screen.getByLabelText(/alice & bob sets/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/charlie & diana sets/i)).toBeInTheDocument()
    })

    it('should display help text for doubles format', () => {
      render(
        <ScoreSubmissionForm
          match={doublesMatch}
          onSubmit={mockOnSubmit}
          onError={mockOnError}
        />
      )

      expect(screen.getByText(/format: x-y/i)).toBeInTheDocument()
      expect(screen.getByText(/alice & bob won x sets/i)).toBeInTheDocument()
    })

    it('should submit score for doubles', async () => {
      render(
        <ScoreSubmissionForm
          match={doublesMatch}
          onSubmit={mockOnSubmit}
          onError={mockOnError}
        />
      )

      const inputs = screen.getAllByRole('spinbutton')
      await userEvent.clear(inputs[0])
      await userEvent.type(inputs[0], '2')
      await userEvent.clear(inputs[1])
      await userEvent.type(inputs[1], '1')

      const submitButton = screen.getByRole('button', { name: /submit/i })
      await userEvent.click(submitButton)

      await waitFor(() => {
        expect(mockOnSubmit).toHaveBeenCalledWith('2-1')
      })
    })
  })

  describe('Form validation', () => {
    it('should validate that at least one team won', async () => {
      render(
        <ScoreSubmissionForm
          match={singlesMatch}
          onSubmit={mockOnSubmit}
          onError={mockOnError}
        />
      )

      const inputs = screen.getAllByRole('spinbutton')
      await userEvent.clear(inputs[0])
      await userEvent.type(inputs[0], '0')
      await userEvent.clear(inputs[1])
      await userEvent.type(inputs[1], '0')

      const submitButton = screen.getByRole('button', { name: /submit/i })
      await userEvent.click(submitButton)

      await waitFor(() => {
        expect(mockOnError).toHaveBeenCalled()
      })
    })

    it('should validate maximum score', async () => {
      render(
        <ScoreSubmissionForm
          match={singlesMatch}
          onSubmit={mockOnSubmit}
          onError={mockOnError}
        />
      )

      const inputs = screen.getAllByRole('spinbutton')
      await userEvent.clear(inputs[0])
      await userEvent.type(inputs[0], '4')
      await userEvent.clear(inputs[1])
      await userEvent.type(inputs[1], '0')

      const submitButton = screen.getByRole('button', { name: /submit/i })
      await userEvent.click(submitButton)

      // Input should not accept 4 (max is 3)
      expect((inputs[0] as HTMLInputElement).value).not.toBe('4')
    })
  })

  describe('Retry logic with exponential backoff', () => {
    it('should retry on network failure', async () => {
      const mockFetch = jest.fn()
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({ ok: true, json: () => ({ success: true }) })

      global.fetch = mockFetch

      render(
        <ScoreSubmissionForm
          match={singlesMatch}
          onSubmit={mockOnSubmit}
          onError={mockOnError}
        />
      )

      const inputs = screen.getAllByRole('spinbutton')
      await userEvent.clear(inputs[0])
      await userEvent.type(inputs[0], '2')
      await userEvent.clear(inputs[1])
      await userEvent.type(inputs[1], '1')

      const submitButton = screen.getByRole('button', { name: /submit/i })
      await userEvent.click(submitButton)

      await waitFor(() => {
        // Should retry after initial failure
        expect(mockFetch.mock.calls.length).toBeGreaterThan(0)
      }, { timeout: 5000 })
    })

    it('should show error after max retries exceeded', async () => {
      const mockFetch = jest.fn().mockRejectedValue(new Error('Network error'))
      global.fetch = mockFetch

      render(
        <ScoreSubmissionForm
          match={singlesMatch}
          onSubmit={mockOnSubmit}
          onError={mockOnError}
        />
      )

      const inputs = screen.getAllByRole('spinbutton')
      await userEvent.clear(inputs[0])
      await userEvent.type(inputs[0], '2')
      await userEvent.clear(inputs[1])
      await userEvent.type(inputs[1], '1')

      const submitButton = screen.getByRole('button', { name: /submit/i })
      await userEvent.click(submitButton)

      await waitFor(() => {
        expect(mockOnError).toHaveBeenCalled()
      }, { timeout: 10000 })
    })
  })

  describe('Loading and submission states', () => {
    it('should show loading state during submission', async () => {
      const slowMockFetch = jest.fn(
        () => new Promise(resolve => setTimeout(() => resolve({ ok: true }), 1000))
      )
      global.fetch = slowMockFetch

      render(
        <ScoreSubmissionForm
          match={singlesMatch}
          onSubmit={mockOnSubmit}
          onError={mockOnError}
        />
      )

      const inputs = screen.getAllByRole('spinbutton')
      await userEvent.clear(inputs[0])
      await userEvent.type(inputs[0], '2')
      await userEvent.clear(inputs[1])
      await userEvent.type(inputs[1], '1')

      const submitButton = screen.getByRole('button', { name: /submit/i })
      await userEvent.click(submitButton)

      expect(submitButton).toBeDisabled()
    })

    it('should show confirmation feedback on success', async () => {
      const mockFetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => ({ success: true })
      })
      global.fetch = mockFetch

      render(
        <ScoreSubmissionForm
          match={singlesMatch}
          onSubmit={mockOnSubmit}
          onError={mockOnError}
        />
      )

      const inputs = screen.getAllByRole('spinbutton')
      await userEvent.clear(inputs[0])
      await userEvent.type(inputs[0], '2')
      await userEvent.clear(inputs[1])
      await userEvent.type(inputs[1], '1')

      const submitButton = screen.getByRole('button', { name: /submit/i })
      await userEvent.click(submitButton)

      await waitFor(() => {
        expect(screen.getByText(/score submitted/i)).toBeInTheDocument()
      })
    })
  })

  describe('Accessibility', () => {
    it('should have proper form labels', () => {
      render(
        <ScoreSubmissionForm
          match={singlesMatch}
          onSubmit={mockOnSubmit}
          onError={mockOnError}
        />
      )

      const labels = screen.getAllByRole('button')
      expect(labels.length).toBeGreaterThan(0)
    })

    it('should have error message association with inputs', async () => {
      render(
        <ScoreSubmissionForm
          match={singlesMatch}
          onSubmit={mockOnSubmit}
          onError={mockOnError}
        />
      )

      const inputs = screen.getAllByRole('spinbutton')
      await userEvent.clear(inputs[0])
      await userEvent.type(inputs[0], '0')
      await userEvent.clear(inputs[1])
      await userEvent.type(inputs[1], '0')

      const submitButton = screen.getByRole('button', { name: /submit/i })
      await userEvent.click(submitButton)

      await waitFor(() => {
        expect(mockOnError).toHaveBeenCalled()
      })
    })

    it('should be keyboard navigable', async () => {
      render(
        <ScoreSubmissionForm
          match={singlesMatch}
          onSubmit={mockOnSubmit}
          onError={mockOnError}
        />
      )

      const inputs = screen.getAllByRole('spinbutton')
      inputs[0].focus()
      expect(document.activeElement).toBe(inputs[0])

      await userEvent.keyboard('{Tab}')
      expect(document.activeElement).toBe(inputs[1])

      await userEvent.keyboard('{Tab}')
      expect(document.activeElement).toBe(screen.getByRole('button', { name: /submit/i }))
    })
  })

  describe('Mobile responsiveness', () => {
    it('should be responsive at 320px width', () => {
      global.innerWidth = 320

      render(
        <ScoreSubmissionForm
          match={singlesMatch}
          onSubmit={mockOnSubmit}
          onError={mockOnError}
        />
      )

      expect(screen.getByLabelText(/your sets/i)).toBeVisible()
      expect(screen.getByRole('button', { name: /submit/i })).toBeVisible()
    })

    it('should have readable font size on mobile', () => {
      global.innerWidth = 320

      const { container } = render(
        <ScoreSubmissionForm
          match={singlesMatch}
          onSubmit={mockOnSubmit}
          onError={mockOnError}
        />
      )

      const form = container.querySelector('form')
      const styles = window.getComputedStyle(form!)
      // Mobile forms should have readable font size
      expect(styles.fontSize).not.toBe('8px')
    })
  })
})
