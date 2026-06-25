/**
 * ChannelSwitcher — V5.2 thread model UI
 *
 * Tests:
 * - Renders the Announcements channel always
 * - Renders DM threads for the viewer's DM conversations
 * - Renders match threads
 * - Calls onSelect with the correct thread key when a channel is clicked
 * - Highlights the active channel
 * - Does NOT offer an "arbitrary DM" / "New DM" entry (DMs only start via match card)
 */

import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { ChannelSwitcher } from '../ChannelSwitcher'

const noop = jest.fn()

describe('ChannelSwitcher', () => {
  beforeEach(() => jest.clearAllMocks())

  it('renders the Announcements channel', () => {
    render(
      <ChannelSwitcher
        activeThread="announcements"
        dmThreads={[]}
        matchThreads={[]}
        onSelect={noop}
      />
    )
    expect(screen.getByTestId('channel-announcements')).toBeInTheDocument()
    expect(screen.getByText(/announcements/i)).toBeInTheDocument()
  })

  it('marks the active channel with aria-selected or a highlight testid', () => {
    render(
      <ChannelSwitcher
        activeThread="announcements"
        dmThreads={[]}
        matchThreads={[]}
        onSelect={noop}
      />
    )
    const btn = screen.getByTestId('channel-announcements')
    expect(btn).toHaveAttribute('aria-selected', 'true')
  })

  it('calls onSelect("announcements") when Announcements is clicked', () => {
    const onSelect = jest.fn()
    render(
      <ChannelSwitcher
        activeThread={null}
        dmThreads={[]}
        matchThreads={[]}
        onSelect={onSelect}
      />
    )
    fireEvent.click(screen.getByTestId('channel-announcements'))
    expect(onSelect).toHaveBeenCalledWith('announcements')
  })

  it('renders each DM thread with data-testid channel-dm-{playerId}', () => {
    render(
      <ChannelSwitcher
        activeThread={null}
        dmThreads={[
          { playerId: 'player_a', displayName: 'Alice' },
          { playerId: 'player_b', displayName: 'Bob' },
        ]}
        matchThreads={[]}
        onSelect={noop}
      />
    )
    expect(screen.getByTestId('channel-dm-player_a')).toBeInTheDocument()
    expect(screen.getByTestId('channel-dm-player_b')).toBeInTheDocument()
    expect(screen.getByText('Alice')).toBeInTheDocument()
    expect(screen.getByText('Bob')).toBeInTheDocument()
  })

  it('calls onSelect("dm:player_a") when that DM thread is clicked', () => {
    const onSelect = jest.fn()
    render(
      <ChannelSwitcher
        activeThread={null}
        dmThreads={[{ playerId: 'player_a', displayName: 'Alice' }]}
        matchThreads={[]}
        onSelect={onSelect}
      />
    )
    fireEvent.click(screen.getByTestId('channel-dm-player_a'))
    expect(onSelect).toHaveBeenCalledWith('dm:player_a')
  })

  it('renders match threads with data-testid channel-match-{matchId}', () => {
    render(
      <ChannelSwitcher
        activeThread={null}
        dmThreads={[]}
        matchThreads={[
          { matchId: 'match_1', label: 'Match vs Bob' },
        ]}
        onSelect={noop}
      />
    )
    expect(screen.getByTestId('channel-match-match_1')).toBeInTheDocument()
    expect(screen.getByText('Match vs Bob')).toBeInTheDocument()
  })

  it('calls onSelect("match:match_1") when that match thread is clicked', () => {
    const onSelect = jest.fn()
    render(
      <ChannelSwitcher
        activeThread={null}
        dmThreads={[]}
        matchThreads={[{ matchId: 'match_1', label: 'Match vs Bob' }]}
        onSelect={onSelect}
      />
    )
    fireEvent.click(screen.getByTestId('channel-match-match_1'))
    expect(onSelect).toHaveBeenCalledWith('match:match_1')
  })

  it('does NOT render any "New DM" or arbitrary DM entry', () => {
    render(
      <ChannelSwitcher
        activeThread={null}
        dmThreads={[]}
        matchThreads={[]}
        onSelect={noop}
      />
    )
    // No arbitrary-DM affordance
    expect(screen.queryByTestId('channel-new-dm')).not.toBeInTheDocument()
    expect(screen.queryByText(/new dm|new message|new direct/i)).not.toBeInTheDocument()
  })

  it('marks the active DM thread with aria-selected=true', () => {
    render(
      <ChannelSwitcher
        activeThread="dm:player_a"
        dmThreads={[{ playerId: 'player_a', displayName: 'Alice' }]}
        matchThreads={[]}
        onSelect={noop}
      />
    )
    expect(screen.getByTestId('channel-dm-player_a')).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByTestId('channel-announcements')).toHaveAttribute('aria-selected', 'false')
  })

  it('marks the active match thread with aria-selected=true', () => {
    render(
      <ChannelSwitcher
        activeThread="match:match_1"
        dmThreads={[]}
        matchThreads={[{ matchId: 'match_1', label: 'Match vs Bob' }]}
        onSelect={noop}
      />
    )
    expect(screen.getByTestId('channel-match-match_1')).toHaveAttribute('aria-selected', 'true')
  })
})
