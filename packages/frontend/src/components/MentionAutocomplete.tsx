import React from 'react'

interface MentionMember {
  name: string
}

interface MentionAutocompleteProps {
  members: MentionMember[]
  query: string
  onSelect: (name: string) => void
  onClose: () => void
  /** Whether the group's @coach assistant is enabled (mirrors trigger.ts). */
  assistantEnabled?: boolean
}

// Mirrors packages/api/src/assistant/trigger.ts ASSISTANT_TRIGGER_NAME/DISPLAY_NAME
const ASSISTANT_TRIGGER_NAME = 'coach'
const ASSISTANT_DISPLAY_NAME = 'Coach'
const ASSISTANT_HINT = 'Ask about matches, standings, how-to'

export const MentionAutocomplete: React.FC<MentionAutocompleteProps> = ({
  members,
  query,
  onSelect,
  onClose,
  assistantEnabled = false,
}) => {
  const filtered = members.filter(m =>
    m.name.toLowerCase().includes(query.toLowerCase())
  )
  // Coach is filtered like a member by prefix, but always ranked first on match.
  const showAssistant =
    assistantEnabled && ASSISTANT_TRIGGER_NAME.startsWith(query.toLowerCase())

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
      {showAssistant && (
        <li
          data-testid="mention-option-assistant"
          role="option"
          aria-selected={false}
          tabIndex={0}
          className="px-3 py-2 text-sm cursor-pointer hover:bg-[--court-50] focus:bg-[--court-50] outline-none border-b border-[--border]"
          onClick={() => onSelect(ASSISTANT_DISPLAY_NAME)}
          onKeyDown={e => {
            if (e.key === 'Enter') {
              e.preventDefault()
              onSelect(ASSISTANT_DISPLAY_NAME)
            } else if (e.key === 'Escape') {
              e.preventDefault()
              onClose()
            }
          }}
        >
          <span className="font-medium text-[--court-700]">{ASSISTANT_DISPLAY_NAME}</span>
          <span className="block text-xs text-[--ink-500]">{ASSISTANT_HINT}</span>
        </li>
      )}
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
