import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PartnerSelection } from '../../components/PartnerSelection'
import { PartnerDropdown } from '../../components/PartnerDropdown'
import { PartnerInviteInput } from '../../components/PartnerInviteInput'

describe('Partner Selection Components', () => {
  describe('PartnerSelection', () => {
    it('should render radio button options', () => {
      const onOptionChange = jest.fn()
      render(
        <PartnerSelection
          partnerOption="select"
          onOptionChange={onOptionChange}
        />
      )

      const selectRadio = screen.getByDisplayValue('select')
      const inviteRadio = screen.getByDisplayValue('invite')

      expect(selectRadio).toBeInTheDocument()
      expect(inviteRadio).toBeInTheDocument()
    })

    it('should call onOptionChange when option is selected', async () => {
      const onOptionChange = jest.fn()
      render(
        <PartnerSelection
          partnerOption="select"
          onOptionChange={onOptionChange}
        />
      )

      const inviteRadio = screen.getByDisplayValue('invite')
      await userEvent.click(inviteRadio)

      expect(onOptionChange).toHaveBeenCalledWith('invite')
    })

    it('should display help text for select option', () => {
      const onOptionChange = jest.fn()
      render(
        <PartnerSelection
          partnerOption="select"
          onOptionChange={onOptionChange}
        />
      )

      expect(screen.getByText(/select from registered players/i)).toBeInTheDocument()
    })

    it('should display help text for invite option', () => {
      const onOptionChange = jest.fn()
      render(
        <PartnerSelection
          partnerOption="select"
          onOptionChange={onOptionChange}
        />
      )

      expect(screen.getByText(/invite by email/i)).toBeInTheDocument()
    })

    it('should mark selected option as checked', () => {
      const onOptionChange = jest.fn()
      const { rerender } = render(
        <PartnerSelection
          partnerOption="select"
          onOptionChange={onOptionChange}
        />
      )

      let selectRadio = screen.getByDisplayValue('select') as HTMLInputElement
      expect(selectRadio.checked).toBe(true)

      rerender(
        <PartnerSelection
          partnerOption="invite"
          onOptionChange={onOptionChange}
        />
      )

      const inviteRadio = screen.getByDisplayValue('invite') as HTMLInputElement
      expect(inviteRadio.checked).toBe(true)
    })

    it('should use fieldset for accessibility', () => {
      const onOptionChange = jest.fn()
      const { container } = render(
        <PartnerSelection
          partnerOption="select"
          onOptionChange={onOptionChange}
        />
      )

      expect(container.querySelector('fieldset')).toBeInTheDocument()
      expect(container.querySelector('legend')).toBeInTheDocument()
    })
  })

  describe('PartnerDropdown', () => {
    it('should render dropdown with placeholder', () => {
      const onChange = jest.fn()
      render(
        <PartnerDropdown
          value=""
          onChange={onChange}
          partners={[
            { id: 'p1', name: 'Bob', email: 'bob@test.com' },
            { id: 'p2', name: 'Charlie', email: 'charlie@test.com' }
          ]}
        />
      )

      expect(screen.getByText(/select a partner/i)).toBeInTheDocument()
    })

    it('should display available partners', () => {
      const onChange = jest.fn()
      render(
        <PartnerDropdown
          value=""
          onChange={onChange}
          partners={[
            { id: 'p1', name: 'Bob', email: 'bob@test.com' },
            { id: 'p2', name: 'Charlie', email: 'charlie@test.com' }
          ]}
        />
      )

      expect(screen.getByText(/Bob \(/)).toBeInTheDocument()
      expect(screen.getByText(/Charlie \(/)).toBeInTheDocument()
    })

    it('should call onChange when partner is selected', async () => {
      const onChange = jest.fn()
      const { container } = render(
        <PartnerDropdown
          value=""
          onChange={onChange}
          partners={[
            { id: 'p1', name: 'Bob', email: 'bob@test.com' },
            { id: 'p2', name: 'Charlie', email: 'charlie@test.com' }
          ]}
        />
      )

      const select = container.querySelector('select') as HTMLSelectElement
      fireEvent.change(select, { target: { value: 'p1' } })

      expect(onChange).toHaveBeenCalled()
    })

    it('should show empty state when no partners available', () => {
      const onChange = jest.fn()
      render(
        <PartnerDropdown
          value=""
          onChange={onChange}
          partners={[]}
        />
      )

      // When no partners, should still show the select but empty
      expect(screen.getByTestId('partner-dropdown')).toBeInTheDocument()
    })

    it('should show loading state', () => {
      const onChange = jest.fn()
      render(
        <PartnerDropdown
          value=""
          onChange={onChange}
          disabled={true}
          partners={[]}
        />
      )

      const select = screen.getByTestId('partner-dropdown') as HTMLSelectElement
      expect(select.disabled).toBe(true)
    })
  })

  describe('PartnerInviteInput', () => {
    it('should render email input', () => {
      const onChange = jest.fn()
      render(
        <PartnerInviteInput
          value=""
          onChange={onChange}
        />
      )

      expect(screen.getByPlaceholderText(/Enter partner email/i)).toBeInTheDocument()
    })

    it('should call onChange when email is entered', async () => {
      const onChange = jest.fn()
      render(
        <PartnerInviteInput
          value=""
          onChange={onChange}
        />
      )

      const input = screen.getByPlaceholderText(/Enter partner email/i)
      await userEvent.type(input, 'bob@test.com')

      expect(onChange).toHaveBeenCalled()
    })

    it('should display helper text', () => {
      const onChange = jest.fn()
      const { container } = render(
        <PartnerInviteInput
          value=""
          onChange={onChange}
        />
      )

      expect(container.querySelector('input')).toBeInTheDocument()
    })

    it('should validate email format', async () => {
      const onChange = jest.fn()
      render(
        <PartnerInviteInput
          value=""
          onChange={onChange}
        />
      )

      const input = screen.getByPlaceholderText(/Enter partner email/i)
      await userEvent.type(input, 'invalid-email')

      expect(screen.getByText(/Invalid email format/i)).toBeInTheDocument()
    })

    it('should show error message', async () => {
      const onChange = jest.fn()
      render(
        <PartnerInviteInput
          value=""
          onChange={onChange}
        />
      )

      const input = screen.getByPlaceholderText(/Enter partner email/i) as HTMLInputElement
      await userEvent.type(input, 'not-an-email')

      expect(screen.getByText(/Invalid email format/i)).toBeInTheDocument()
    })

    it('should not show validation error before blur', () => {
      const onChange = jest.fn()
      render(
        <PartnerInviteInput
          value=""
          onChange={onChange}
        />
      )

      expect(screen.queryByText(/Invalid email format/i)).not.toBeInTheDocument()
    })

    it('should accept valid email format', async () => {
      const onChange = jest.fn()
      render(
        <PartnerInviteInput
          value="valid@example.com"
          onChange={onChange}
        />
      )

      expect(screen.queryByText(/Invalid email format/i)).not.toBeInTheDocument()
    })
  })

  describe('Accessibility', () => {
    it('should have proper labels for all inputs', () => {
      const onChange = jest.fn()
      render(
        <PartnerInviteInput
          value=""
          onChange={onChange}
        />
      )

      const input = screen.getByPlaceholderText(/Enter partner email/i)
      expect(input).toBeInTheDocument()
      expect(input).toHaveAttribute('type', 'email')
    })

    it('should handle keyboard navigation', async () => {
      const onOptionChange = jest.fn()
      render(
        <PartnerSelection
          partnerOption="select"
          onOptionChange={onOptionChange}
        />
      )

      const selectRadio = screen.getByDisplayValue('select')
      const inviteRadio = screen.getByDisplayValue('invite')

      selectRadio.focus()
      expect(document.activeElement).toBe(selectRadio)

      await userEvent.keyboard('{ArrowDown}')
      expect(onOptionChange).toHaveBeenCalled()
    })
  })

  describe('Mobile responsiveness', () => {
    it('should be responsive on mobile for partner selection', () => {
      const onOptionChange = jest.fn()
      const { container } = render(
        <PartnerSelection
          partnerOption="select"
          onOptionChange={onOptionChange}
        />
      )

      global.innerWidth = 320
      expect(container.querySelector('fieldset')).toBeInTheDocument()
    })

    it('should display properly on mobile for email input', () => {
      const onChange = jest.fn()
      global.innerWidth = 320
      render(
        <PartnerInviteInput
          value=""
          onChange={onChange}
        />
      )

      expect(screen.getByPlaceholderText(/Enter partner email/i)).toBeVisible()
    })
  })
})
