/**
 * A7.3 — Coach pinned in the @ mention picker (RED first)
 *
 * Coach is the pinned first entry with hint text, filtered by prefix like a
 * member (but always ranked first on match), selectable → inserts an
 * unquoted '@coach ' via onSelect('Coach'), and hidden entirely when
 * assistantEnabled is false.
 */
import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { MentionAutocomplete } from '../MentionAutocomplete'

const MEMBERS = [{ name: 'Alice Smith' }, { name: 'Bob Jones' }]

describe('MentionAutocomplete — Coach entry (A7.3)', () => {
  const onSelect = jest.fn()
  const onClose = jest.fn()

  beforeEach(() => jest.resetAllMocks())

  it('pins Coach first with hint text when assistantEnabled and query is empty', () => {
    render(
      <MentionAutocomplete
        members={MEMBERS}
        query=""
        onSelect={onSelect}
        onClose={onClose}
        assistantEnabled
      />
    )
    const options = screen.getAllByTestId(/mention-option/)
    expect(options[0]).toHaveTextContent('Coach')
    expect(options[0]).toHaveTextContent('Ask about matches, standings, how-to')
  })

  it('selecting Coach calls onSelect with "Coach"', () => {
    render(
      <MentionAutocomplete
        members={MEMBERS}
        query=""
        onSelect={onSelect}
        onClose={onClose}
        assistantEnabled
      />
    )
    fireEvent.click(screen.getByTestId('mention-option-assistant'))
    expect(onSelect).toHaveBeenCalledWith('Coach')
  })

  it('Coach appears when the query prefix-matches "co" even if no member matches', () => {
    render(
      <MentionAutocomplete
        members={MEMBERS}
        query="co"
        onSelect={onSelect}
        onClose={onClose}
        assistantEnabled
      />
    )
    expect(screen.getByTestId('mention-option-assistant')).toBeInTheDocument()
    expect(screen.queryAllByTestId('mention-option')).toHaveLength(0)
  })

  it('Coach does not appear when the query does not match "coach"', () => {
    render(
      <MentionAutocomplete
        members={MEMBERS}
        query="ali"
        onSelect={onSelect}
        onClose={onClose}
        assistantEnabled
      />
    )
    expect(screen.queryByTestId('mention-option-assistant')).not.toBeInTheDocument()
    expect(screen.getByText('Alice Smith')).toBeInTheDocument()
  })

  it('is hidden entirely when assistantEnabled is false', () => {
    render(
      <MentionAutocomplete
        members={MEMBERS}
        query="co"
        onSelect={onSelect}
        onClose={onClose}
        assistantEnabled={false}
      />
    )
    expect(screen.queryByTestId('mention-option-assistant')).not.toBeInTheDocument()
  })
})
