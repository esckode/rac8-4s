import React, { InputHTMLAttributes, useState } from 'react'

interface PartnerInviteInputProps extends InputHTMLAttributes<HTMLInputElement> {
  value?: string
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void
  onValidationChange?: (isValid: boolean) => void
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export const PartnerInviteInput: React.FC<PartnerInviteInputProps> = ({
  value,
  onChange,
  onValidationChange,
  ...props
}) => {
  const [error, setError] = useState<string>('')

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const email = e.target.value

    if (!email) {
      setError('')
      onValidationChange?.(false)
    } else if (!EMAIL_REGEX.test(email)) {
      setError('Invalid email format')
      onValidationChange?.(false)
    } else {
      setError('')
      onValidationChange?.(true)
    }

    onChange?.(e)
  }

  return (
    <div>
      <input
        type="email"
        value={value || ''}
        onChange={handleChange}
        placeholder="Enter partner email..."
        data-testid="partner-invite-input"
        {...props}
      />
      {error && <span className="error">{error}</span>}
    </div>
  )
}
