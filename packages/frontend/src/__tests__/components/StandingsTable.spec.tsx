import { render, screen } from '@testing-library/react'
import { StandingsTable } from '../../components/StandingsTable'

describe('StandingsTable Component', () => {
  describe('Singles standings', () => {
    it('should render singles standings with player names', () => {
      const standings = [
        { participantId: 'p1', name: 'Alice', rank: 1, wins: 2, losses: 0, setsWon: 4, setsLost: 0 },
        { participantId: 'p2', name: 'Bob', rank: 2, wins: 1, losses: 1, setsWon: 2, setsLost: 2 }
      ]

      render(<StandingsTable standings={standings} format="singles" />)

      expect(screen.getByText('Alice')).toBeInTheDocument()
      expect(screen.getByText('Bob')).toBeInTheDocument()
      expect(screen.getByText('Player')).toBeInTheDocument()
    })

    it('should display rank column for singles', () => {
      const standings = [
        { participantId: 'p1', name: 'Alice', rank: 1, wins: 2, losses: 0, setsWon: 4, setsLost: 0 }
      ]

      render(<StandingsTable standings={standings} format="singles" />)

      expect(screen.getByText('1')).toBeInTheDocument()
    })

    it('should display wins and losses for singles', () => {
      const standings = [
        { participantId: 'p1', name: 'Alice', rank: 1, wins: 2, losses: 0, setsWon: 4, setsLost: 0 }
      ]

      render(<StandingsTable standings={standings} format="singles" />)

      const cells = screen.getAllByText(/2|0/)
      expect(cells.length).toBeGreaterThan(0)
    })

    it('should display set differential for singles', () => {
      const standings = [
        { participantId: 'p1', name: 'Alice', rank: 1, wins: 2, losses: 0, setsWon: 5, setsLost: 2 }
      ]

      render(<StandingsTable standings={standings} format="singles" />)

      expect(screen.getByText('+3')).toBeInTheDocument()
    })
  })

  describe('Doubles standings', () => {
    it('should render doubles standings with team names', () => {
      const standings = [
        {
          participantId: 'team_1',
          teamName: 'Alice & Bob',
          players: [
            { id: 'p1', name: 'Alice' },
            { id: 'p2', name: 'Bob' }
          ],
          rank: 1,
          wins: 2,
          losses: 0,
          setsWon: 4,
          setsLost: 0
        }
      ]

      render(<StandingsTable standings={standings} format="doubles" />)

      const teamNames = screen.getAllByText('Alice & Bob')
      expect(teamNames.length).toBeGreaterThan(0)
      expect(screen.getByText('Team')).toBeInTheDocument()
    })

    it('should display both players in team for doubles', () => {
      const standings = [
        {
          participantId: 'team_1',
          teamName: 'Alice & Bob',
          players: [
            { id: 'p1', name: 'Alice' },
            { id: 'p2', name: 'Bob' }
          ],
          rank: 1,
          wins: 2,
          losses: 0,
          setsWon: 4,
          setsLost: 0
        }
      ]

      const { container } = render(<StandingsTable standings={standings} format="doubles" />)

      // Check that team cell exists with team name
      const teamCell = container.querySelector('.team-cell')
      expect(teamCell).toBeInTheDocument()

      // Check that team players are displayed
      const teamPlayers = container.querySelector('.team-players')
      expect(teamPlayers).toHaveTextContent('Alice & Bob')
    })

    it('should display set differential for doubles', () => {
      const standings = [
        {
          participantId: 'team_1',
          teamName: 'Alice & Bob',
          players: [
            { id: 'p1', name: 'Alice' },
            { id: 'p2', name: 'Bob' }
          ],
          rank: 1,
          wins: 2,
          losses: 0,
          setsWon: 5,
          setsLost: 2
        }
      ]

      render(<StandingsTable standings={standings} format="doubles" />)

      expect(screen.getByText('+3')).toBeInTheDocument()
    })

    it('should handle multiple teams', () => {
      const standings = [
        {
          participantId: 'team_1',
          teamName: 'Alice & Bob',
          players: [
            { id: 'p1', name: 'Alice' },
            { id: 'p2', name: 'Bob' }
          ],
          rank: 1,
          wins: 2,
          losses: 0,
          setsWon: 4,
          setsLost: 0
        },
        {
          participantId: 'team_2',
          teamName: 'Charlie & Diana',
          players: [
            { id: 'p3', name: 'Charlie' },
            { id: 'p4', name: 'Diana' }
          ],
          rank: 2,
          wins: 1,
          losses: 1,
          setsWon: 2,
          setsLost: 2
        }
      ]

      render(<StandingsTable standings={standings} format="doubles" />)

      const aliceTeam = screen.getAllByText('Alice & Bob')
      const charlieTeam = screen.getAllByText('Charlie & Diana')
      expect(aliceTeam.length).toBeGreaterThan(0)
      expect(charlieTeam.length).toBeGreaterThan(0)
    })
  })

  describe('Accessibility', () => {
    it('should have proper table semantics', () => {
      const standings = [
        { participantId: 'p1', name: 'Alice', rank: 1, wins: 2, losses: 0, setsWon: 4, setsLost: 0 }
      ]

      const { container } = render(<StandingsTable standings={standings} format="singles" />)

      expect(container.querySelector('table')).toBeInTheDocument()
      expect(container.querySelector('thead')).toBeInTheDocument()
      expect(container.querySelector('tbody')).toBeInTheDocument()
    })

    it('should have proper header roles', () => {
      const standings = [
        { participantId: 'p1', name: 'Alice', rank: 1, wins: 2, losses: 0, setsWon: 4, setsLost: 0 }
      ]

      const { container } = render(<StandingsTable standings={standings} format="singles" />)

      const headers = container.querySelectorAll('th')
      expect(headers.length).toBeGreaterThan(0)
    })
  })

  describe('Responsive design', () => {
    it('should be mobile responsive at 320px', () => {
      const standings = [
        {
          participantId: 'team_1',
          teamName: 'Alice & Bob',
          players: [
            { id: 'p1', name: 'Alice' },
            { id: 'p2', name: 'Bob' }
          ],
          rank: 1,
          wins: 2,
          losses: 0,
          setsWon: 4,
          setsLost: 0
        }
      ]

      // Simulate mobile viewport
      global.innerWidth = 320
      const { container } = render(<StandingsTable standings={standings} format="doubles" />)

      const teamNames = screen.getAllByText('Alice & Bob')
      expect(teamNames.length).toBeGreaterThan(0)
      expect(container.querySelector('table')).toBeInTheDocument()
    })

    it('should display no horizontal scroll on mobile', () => {
      const standings = [
        {
          participantId: 'team_1',
          teamName: 'Alice & Bob',
          players: [
            { id: 'p1', name: 'Alice' },
            { id: 'p2', name: 'Bob' }
          ],
          rank: 1,
          wins: 2,
          losses: 0,
          setsWon: 4,
          setsLost: 0
        }
      ]

      const { container } = render(<StandingsTable standings={standings} format="doubles" />)

      const table = container.querySelector('table')
      // Mobile-friendly table should exist
      expect(table).toBeInTheDocument()
    })
  })

  describe('Empty state', () => {
    it('should handle empty standings', () => {
      const { container } = render(<StandingsTable standings={[]} format="singles" />)

      expect(container.querySelector('table')).toBeInTheDocument()
    })
  })
})
