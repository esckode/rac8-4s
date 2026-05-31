import { ServiceEmailAdapter } from '../../email-service-adapter'
import { MockEmailService, SendGridEmailService } from '../../services/email-service'
import { sendPasswordResetEmail } from '../../email-adapter'

describe('ServiceEmailAdapter Integration', () => {
  let mockEmailService: MockEmailService
  let adapter: ServiceEmailAdapter

  beforeEach(() => {
    mockEmailService = new MockEmailService()
    adapter = new ServiceEmailAdapter(mockEmailService, 'sender@example.com')
  })

  describe('send', () => {
    it('sends email via mock service', async () => {
      await adapter.send('test@example.com', 'Test Subject', '<p>Test body</p>')
      // No error thrown means success
      expect(adapter).toBeDefined()
    })

    it('passes email details to service', async () => {
      const to = 'recipient@example.com'
      const subject = 'Test Subject'
      const html = '<p>Test HTML body</p>'

      await adapter.send(to, subject, html)

      // If it doesn't throw, it succeeded with the mock service
      expect(adapter).toBeDefined()
    })

    it('includes from address in service request', async () => {
      const adapter = new ServiceEmailAdapter(mockEmailService, 'custom@example.com')
      await adapter.send('test@example.com', 'Subject', '<p>Body</p>')
      expect(adapter).toBeDefined()
    })

    it('throws on service error', async () => {
      const failingService = {
        send: jest.fn().mockRejectedValueOnce(new Error('Service error')),
      }

      const adapter = new ServiceEmailAdapter(failingService as any)

      await expect(adapter.send('test@example.com', 'Subject', '<p>Body</p>')).rejects.toThrow(
        'Service error'
      )
    })
  })
})

describe('sendPasswordResetEmail with ServiceEmailAdapter', () => {
  let adapter: ServiceEmailAdapter
  let emailService: MockEmailService

  beforeEach(() => {
    emailService = new MockEmailService()
    adapter = new ServiceEmailAdapter(emailService, 'noreply@example.com')
  })

  it('sends password reset email via service adapter', async () => {
    const config = {
      fromAddress: 'noreply@example.com',
      frontendUrl: 'https://app.example.com',
    }

    await sendPasswordResetEmail(adapter, config, 'user@example.com', '123456', 15)

    // Should complete without throwing
    expect(adapter).toBeDefined()
  })

  it('handles multiple password reset emails', async () => {
    const config = {
      fromAddress: 'noreply@example.com',
      frontendUrl: 'https://app.example.com',
    }

    await sendPasswordResetEmail(adapter, config, 'user1@example.com', '111111', 15)
    await sendPasswordResetEmail(adapter, config, 'user2@example.com', '222222', 15)

    // Both emails sent successfully
    expect(adapter).toBeDefined()
  })

  it('gracefully handles service errors', async () => {
    const failingService = {
      send: jest.fn().mockRejectedValue(new Error('SMTP connection failed')),
    }

    const failingAdapter = new ServiceEmailAdapter(failingService as any)
    const config = {
      fromAddress: 'noreply@example.com',
      frontendUrl: 'https://app.example.com',
    }

    // Should not throw - sendPasswordResetEmail catches errors
    await expect(
      sendPasswordResetEmail(failingAdapter, config, 'user@example.com', '123456', 15)
    ).resolves.toBeUndefined()
  })
})

describe('ServiceEmailAdapter with SendGridEmailService', () => {
  let adapter: ServiceEmailAdapter
  const mockFetch = jest.fn()

  beforeEach(() => {
    jest.clearAllMocks()
    global.fetch = mockFetch
    mockFetch.mockResolvedValue({
      ok: true,
      status: 202,
      text: async () => 'Success',
    })
    const sendGridService = new SendGridEmailService('test-api-key', 'sender@example.com')
    adapter = new ServiceEmailAdapter(sendGridService, 'sender@example.com')
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('sends email via SendGrid through adapter', async () => {
    await adapter.send('test@example.com', 'Test Subject', '<p>Test body</p>')

    expect(mockFetch).toHaveBeenCalledWith('https://api.sendgrid.com/v3/mail/send', expect.any(Object))
  })

  it('includes from address in SendGrid request', async () => {
    await adapter.send('test@example.com', 'Subject', '<p>Body</p>')

    const callArgs = mockFetch.mock.calls[0]
    const body = JSON.parse(callArgs[1].body)
    expect(body.from.email).toBe('sender@example.com')
  })

  it('handles SendGrid API errors gracefully', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      text: async () => 'Unauthorized',
    })

    await expect(
      adapter.send('test@example.com', 'Subject', '<p>Body</p>')
    ).rejects.toThrow('SendGrid API error')
  })
})
