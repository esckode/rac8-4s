import React from 'react'

interface MentionMember {
  name: string
}

interface MentionAutocompleteProps {
  members: MentionMember[]
  query: string
  onSelect: (name: string) => void
  onClose: () => void
}

export const MentionAutocomplete: React.FC<MentionAutocompleteProps> = ({
  members,
  query,
  onSelect,
  onClose,
}) => {
  const filtered = members.filter(m =>
    m.name.toLowerCase().includes(query.toLowerCase())
  )

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
    }
  }

  return (
    <ul
      data-testid="mention-autocomplete"
      role="listbox"
      aria-label="Mention a member"
      onKeyDown={handleKeyDown}
      className="absolute bottom-full left-0 mb-1 bg-[--surface] border border-[--border] rounded shadow-md w-48 max-h-40 overflow-y-auto z-10"
    >
      {filtered.map(m => (
        <li
          key={m.name}
          data-testid="mention-option"
          role="option"
          aria-selected={false}
          tabIndex={0}
          className="px-3 py-2 text-sm cursor-pointer hover:bg-[--ink-50] focus:bg-[--ink-50] outline-none"
          onClick={() => onSelect(m.name)}
          onKeyDown={e => {
            if (e.key === 'Enter') {
              e.preventDefault()
              onSelect(m.name)
            } else if (e.key === 'Escape') {
              e.preventDefault()
              onClose()
            }
          }}
        >
          {m.name}
        </li>
      ))}
    </ul>
  )
}
