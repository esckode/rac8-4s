import React, { SelectHTMLAttributes } from 'react'

interface Partner {
  id: string
  name: string
  email: string
}

interface PartnerDropdownProps extends SelectHTMLAttributes<HTMLSelectElement> {
  partners: Partner[]
  value?: string
  onChange?: (e: React.ChangeEvent<HTMLSelectElement>) => void
}

export const PartnerDropdown: React.FC<PartnerDropdownProps> = ({
  partners,
  value,
  onChange,
  ...props
}) => {
  return (
    <select
      value={value || ''}
      onChange={onChange}
      data-testid="partner-dropdown"
      {...props}
    >
      <option value="">Select a partner...</option>
      {partners.map(partner => (
        <option key={partner.id} value={partner.id}>
          {partner.name} ({partner.email})
        </option>
      ))}
    </select>
  )
}
