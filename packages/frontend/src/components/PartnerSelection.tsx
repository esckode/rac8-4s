import React from 'react'

interface PartnerSelectionProps {
  partnerOption: 'select' | 'invite'
  onOptionChange: (option: 'select' | 'invite') => void
}

export function PartnerSelection({ partnerOption, onOptionChange }: PartnerSelectionProps) {
  return (
    <div className="partner-selection">
      <fieldset>
        <legend>How do you want to find your partner?</legend>

        <div className="radio-option">
          <label>
            <input
              type="radio"
              value="select"
              checked={partnerOption === 'select'}
              onChange={(e) => onOptionChange(e.target.value as 'select')}
            />
            <span>Select from registered players</span>
            <small>Choose a player already registered for this tournament</small>
          </label>
        </div>

        <div className="radio-option">
          <label>
            <input
              type="radio"
              value="invite"
              checked={partnerOption === 'invite'}
              onChange={(e) => onOptionChange(e.target.value as 'invite')}
            />
            <span>Invite by email</span>
            <small>Invite someone new to join as your partner</small>
          </label>
        </div>
      </fieldset>
    </div>
  )
}

interface PartnerDropdownProps {
  tournamentId: string
  value: string
  onChange: (partnerId: string) => void
  partners?: Array<{ id: string; name: string }>
  loading?: boolean
}

export function PartnerDropdown({
  tournamentId,
  value,
  onChange,
  partners = [],
  loading = false
}: PartnerDropdownProps) {
  if (loading) {
    return <div className="loading">Loading partners...</div>
  }

  if (partners.length === 0) {
    return (
      <div className="no-partners">
        No other players available to team up. Try inviting someone instead.
      </div>
    )
  }

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="partner-dropdown"
    >
      <option value="">-- Select a partner --</option>
      {partners.map((partner) => (
        <option key={partner.id} value={partner.id}>
          {partner.name}
        </option>
      ))}
    </select>
  )
}

interface PartnerInviteInputProps {
  value: string
  onChange: (email: string) => void
  onBlur?: () => void
  error?: string
}

export function PartnerInviteInput({
  value,
  onChange,
  onBlur,
  error
}: PartnerInviteInputProps) {
  const [touched, setTouched] = React.useState(false)

  const handleBlur = () => {
    setTouched(true)
    onBlur?.()
  }

  const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
  const showError = touched && value && !isValidEmail

  return (
    <div className="invite-input-group">
      <input
        type="email"
        placeholder="partner@example.com"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={handleBlur}
        className={`partner-email ${showError ? 'error' : ''}`}
      />
      {showError && (
        <span className="error-message">Please enter a valid email</span>
      )}
      {error && (
        <span className="error-message">{error}</span>
      )}
      <small className="helper-text">
        They'll receive an email invitation and create their account
      </small>
    </div>
  )
}
