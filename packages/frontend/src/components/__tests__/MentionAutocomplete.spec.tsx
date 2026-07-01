import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { MentionAutocomplete } from '../MentionAutocomplete'

const MEMBERS = [
  { name: 'Alice Smith' },
  { name: 'Bob Jones' },
  { name: 'Charlie Brown' },
]

describe('MentionAutocomplete', () => {
  const onSelect = jest.fn()
  const onClose = jest.fn()

  beforeEach(() => jest.resetAllMocks())

  it('renders all members when query is empty', () => {
    render(<MentionAutocomplete members={MEMBERS} query="" onSelect={onSelect} onClose={onClose} />)
    expect(screen.getByTestId('mention-autocomplete')).toBeInTheDocument()
    expect(screen.getAllByTestId('mention-option')).toHaveLength(3)
  })

  it('filters members by query (case-insensitive)', () => {
    render(<MentionAutocomplete members={MEMBERS} query="ali" onSelect={onSelect} onClose={onClose} />)
    expect(screen.getAllByTestId('mention-option')).toHaveLength(1)
    expect(screen.getByText('Alice Smith')).toBeInTheDocument()
  })

  it('calls onSelect with the member name when clicked', () => {
    render(<MentionAutocomplete members={MEMBERS} query="" onSelect={onSelect} onClose={onClose} />)
    fireEvent.click(screen.getByText('Bob Jones'))
    expect(onSelect).toHaveBeenCalledWith('Bob Jones')
  })

  it('shows no results when no member matches the query', () => {
    render(<MentionAutocomplete members={MEMBERS} query="xyz" onSelect={onSelect} onClose={onClose} />)
    expect(screen.queryByTestId('mention-option')).not.toBeInTheDocument()
  })

  it('is keyboard accessible (Enter selects the focused option)', () => {
    render(<MentionAutocomplete members={MEMBERS} query="" onSelect={onSelect} onClose={onClose} />)
    const first = screen.getAllByTestId('mention-option')[0]
    first.focus()
    fireEvent.keyDown(first, { key: 'Enter' })
    expect(onSelect).toHaveBeenCalledWith('Alice Smith')
  })

  it('calls onClose on Escape', () => {
    render(<MentionAutocomplete members={MEMBERS} query="" onSelect={onSelect} onClose={onClose} />)
    const list = screen.getByTestId('mention-autocomplete')
    fireEvent.keyDown(list, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })
})
