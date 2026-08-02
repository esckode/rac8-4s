/**
 * A7.3 — Ref pinned in the @ mention picker (RED first)
 * N4 (Phase N, design §12 N-Q5) — renamed from Coach.
 *
 * Ref is the pinned first entry with hint text, filtered by prefix like a
 * member (but always ranked first on match), selectable → inserts an
 * unquoted '@ref ' via onSelect('Ref'), and hidden entirely when
 * assistantEnabled is false.
 */
import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { MentionAutocomplete } from '../MentionAutocomplete'

const MEMBERS = [{ name: 'Alice Smith' }, { name: 'Bob Jones' }]

describe('MentionAutocomplete — Ref entry (A7.3)', () => {
  const onSelect = jest.fn()
  const onClose = jest.fn()

  beforeEach(() => jest.resetAllMocks())

  it('pins Ref first with hint text when assistantEnabled and query is empty', () => {
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
    expect(options[0]).toHaveTextContent('Ref')
    expect(options[0]).toHaveTextContent('Ask about matches, standings, how-to')
  })

  it('selecting Ref calls onSelect with "Ref"', () => {
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
    expect(onSelect).toHaveBeenCalledWith('Ref')
  })

  it('Ref appears when the query prefix-matches "re" even if no member matches', () => {
    render(
      <MentionAutocomplete
        members={MEMBERS}
        query="re"
        onSelect={onSelect}
        onClose={onClose}
        assistantEnabled
      />
    )
    expect(screen.getByTestId('mention-option-assistant')).toBeInTheDocument()
    expect(screen.queryAllByTestId('mention-option')).toHaveLength(0)
  })

  it('Ref does not appear when the query does not match "ref"', () => {
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
        query="re"
        onSelect={onSelect}
        onClose={onClose}
        assistantEnabled={false}
      />
    )
    expect(screen.queryByTestId('mention-option-assistant')).not.toBeInTheDocument()
  })
})
