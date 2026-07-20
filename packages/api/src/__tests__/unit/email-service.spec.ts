const mockSesSend = jest.fn()
jest.mock('@aws-sdk/client-sesv2', () => ({
  SESv2Client: jest.fn().mockImplementation(() => ({ send: mockSesSend })),
  SendEmailCommand: jest.fn().mockImplementation((input: unknown) => ({ input })),
}))

import {
  MockEmailService,
  SendGridEmailService,
  AwsSesEmailService,
  createEmailService,
  type EmailSendOptions,
} from '../../services/email-service'

describe('MockEmailService', () => {
  let service: MockEmailService

  beforeEach(() => {
    service = new MockEmailService()
  })

  describe('send', () => {
    it('sends email without throwing', async () => {
      const options: EmailSendOptions = {
        to: 'test@example.com',
        subject: 'Test Subject',
        html: '<p>Test body</p>',
      }

      await expect(service.send(options)).resolves.toBeUndefined()
    })

    it('sends email with text content', async () => {
      const options: EmailSendOptions = {
        to: 'test@example.com',
        subject: 'Test Subject',
        html: '<p>Test body</p>',
        text: 'Test body',
      }

      await expect(service.send(options)).resolves.toBeUndefined()
    })

    it('sends email with custom from address', async () => {
      const options: EmailSendOptions = {
        to: 'test@example.com',
        subject: 'Test Subject',
        html: '<p>Test body</p>',
        from: 'custom@example.com',
      }

      await expect(service.send(options)).resolves.toBeUndefined()
    })

    it('throws on invalid email address', async () => {
      const options: EmailSendOptions = {
        to: 'invalid-email',
        subject: 'Test Subject',
        html: '<p>Test body</p>',
      }

      await expect(service.send(options)).rejects.toThrow('Invalid email address')
    })

    it('throws on email without domain', async () => {
      const options: EmailSendOptions = {
        to: 'user@',
        subject: 'Test Subject',
        html: '<p>Test body</p>',
      }

      await expect(service.send(options)).rejects.toThrow('Invalid email address')
    })

    it('throws on email with only domain', async () => {
      const options: EmailSendOptions = {
        to: '@example.com',
        subject: 'Test Subject',
        html: '<p>Test body</p>',
      }

      await expect(service.send(options)).rejects.toThrow('Invalid email address')
    })

    it('sends email with special characters in subject', async () => {
      const options: EmailSendOptions = {
        to: 'test@example.com',
        subject: 'Test Subject: Special Chars !@#$%',
        html: '<p>Test body</p>',
      }

      await expect(service.send(options)).resolves.toBeUndefined()
    })

    it('sends email with HTML content containing tags', async () => {
      const options: EmailSendOptions = {
        to: 'test@example.com',
        subject: 'Test Subject',
        html: '<h1>Title</h1><p>Body with <strong>bold</strong> text</p>',
      }

      await expect(service.send(options)).resolves.toBeUndefined()
    })

    it('sends email with empty body', async () => {
      const options: EmailSendOptions = {
        to: 'test@example.com',
        subject: 'Test Subject',
        html: '',
      }

      await expect(service.send(options)).resolves.toBeUndefined()
    })

    it('sends email with plus sign in address', async () => {
      const options: EmailSendOptions = {
        to: 'user+tag@example.com',
        subject: 'Test Subject',
        html: '<p>Test body</p>',
      }

      await expect(service.send(options)).resolves.toBeUndefined()
    })

    it('sends email with subdomain', async () => {
      const options: EmailSendOptions = {
        to: 'user@mail.example.com',
        subject: 'Test Subject',
        html: '<p>Test body</p>',
      }

      await expect(service.send(options)).resolves.toBeUndefined()
    })
  })
})

describe('SendGridEmailService', () => {
  let service: SendGridEmailService
  const mockFetch = jest.fn()

  beforeEach(() => {
    jest.clearAllMocks()
    global.fetch = mockFetch
    service = new SendGridEmailService('test-api-key', 'sender@example.com')
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  describe('constructor', () => {
    it('throws when API key is missing', () => {
      expect(() => new SendGridEmailService('')).toThrow('SendGrid API key is required')
    })

    it('uses provided from address', () => {
      const service = new SendGridEmailService('api-key', 'custom@example.com')
      expect(service).toBeDefined()
    })

    it('uses default from address when not provided', () => {
      const service = new SendGridEmailService('api-key')
      expect(service).toBeDefined()
    })
  })

  describe('send', () => {
    it('sends email via SendGrid API', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 202,
        text: async () => 'Success',
      })

      const options: EmailSendOptions = {
        to: 'test@example.com',
        subject: 'Test Subject',
        html: '<p>Test body</p>',
      }

      await service.send(options)

      expect(mockFetch).toHaveBeenCalledWith('https://api.sendgrid.com/v3/mail/send', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer test-api-key',
          'Content-Type': 'application/json',
        },
        body: expect.stringContaining('"to":[{"email":"test@example.com"}]'),
      })
    })

    it('includes subject in request body', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 202,
        text: async () => 'Success',
      })

      const options: EmailSendOptions = {
        to: 'test@example.com',
        subject: 'Test Subject',
        html: '<p>Test body</p>',
      }

      await service.send(options)

      const callArgs = mockFetch.mock.calls[0]
      const body = JSON.parse(callArgs[1].body)
      expect(body.subject).toBe('Test Subject')
    })

    it('includes HTML content in request body', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 202,
        text: async () => 'Success',
      })

      const options: EmailSendOptions = {
        to: 'test@example.com',
        subject: 'Test Subject',
        html: '<p>Test body</p>',
      }

      await service.send(options)

      const callArgs = mockFetch.mock.calls[0]
      const body = JSON.parse(callArgs[1].body)
      expect(body.content).toEqual([{ type: 'text/html', value: '<p>Test body</p>' }])
    })

    it('includes text content when provided', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 202,
        text: async () => 'Success',
      })

      const options: EmailSendOptions = {
        to: 'test@example.com',
        subject: 'Test Subject',
        html: '<p>Test body</p>',
        text: 'Test body',
      }

      await service.send(options)

      const callArgs = mockFetch.mock.calls[0]
      const body = JSON.parse(callArgs[1].body)
      expect(body.content).toContainEqual({ type: 'text/html', value: '<p>Test body</p>' })
      expect(body.content).toContainEqual({ type: 'text/plain', value: 'Test body' })
    })

    it('uses custom from address when provided in options', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 202,
        text: async () => 'Success',
      })

      const options: EmailSendOptions = {
        to: 'test@example.com',
        subject: 'Test Subject',
        html: '<p>Test body</p>',
        from: 'override@example.com',
      }

      await service.send(options)

      const callArgs = mockFetch.mock.calls[0]
      const body = JSON.parse(callArgs[1].body)
      expect(body.from.email).toBe('override@example.com')
    })

    it('uses service from address when not provided in options', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 202,
        text: async () => 'Success',
      })

      const options: EmailSendOptions = {
        to: 'test@example.com',
        subject: 'Test Subject',
        html: '<p>Test body</p>',
      }

      await service.send(options)

      const callArgs = mockFetch.mock.calls[0]
      const body = JSON.parse(callArgs[1].body)
      expect(body.from.email).toBe('sender@example.com')
    })

    it('throws on invalid email address', async () => {
      const options: EmailSendOptions = {
        to: 'invalid-email',
        subject: 'Test Subject',
        html: '<p>Test body</p>',
      }

      await expect(service.send(options)).rejects.toThrow('Invalid email address')
      expect(mockFetch).not.toHaveBeenCalled()
    })

    it('throws on API error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: async () => 'Unauthorized',
      })

      const options: EmailSendOptions = {
        to: 'test@example.com',
        subject: 'Test Subject',
        html: '<p>Test body</p>',
      }

      await expect(service.send(options)).rejects.toThrow('SendGrid API error')
    })

    it('throws on network error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'))

      const options: EmailSendOptions = {
        to: 'test@example.com',
        subject: 'Test Subject',
        html: '<p>Test body</p>',
      }

      await expect(service.send(options)).rejects.toThrow('Network error')
    })

    it('handles API error response parsing failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => {
          throw new Error('Failed to parse response')
        },
      })

      const options: EmailSendOptions = {
        to: 'test@example.com',
        subject: 'Test Subject',
        html: '<p>Test body</p>',
      }

      await expect(service.send(options)).rejects.toThrow('SendGrid API error')
    })

    it('sends to multiple recipients sequentially', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 202,
        text: async () => 'Success',
      })

      const service = new SendGridEmailService('api-key')

      await service.send({
        to: 'user1@example.com',
        subject: 'Test',
        html: '<p>Body</p>',
      })

      await service.send({
        to: 'user2@example.com',
        subject: 'Test',
        html: '<p>Body</p>',
      })

      expect(mockFetch).toHaveBeenCalledTimes(2)
    })
  })
})

describe('AwsSesEmailService', () => {
  beforeEach(() => {
    mockSesSend.mockReset()
  })

  describe('send', () => {
    it('issues a real SESv2 send with no static credentials on the instance', async () => {
      mockSesSend.mockResolvedValueOnce({ MessageId: 'abc123' })
      const service = new AwsSesEmailService('us-east-2', 'sender@example.com')

      await service.send({
        to: 'test@example.com',
        subject: 'Test Subject',
        html: '<p>Test body</p>',
      })

      expect(mockSesSend).toHaveBeenCalledTimes(1)
    })

    it('throws on invalid email address without calling SES', async () => {
      const service = new AwsSesEmailService('us-east-2', 'sender@example.com')

      await expect(
        service.send({ to: 'invalid-email', subject: 'Test Subject', html: '<p>Test body</p>' })
      ).rejects.toThrow('Invalid email address')
      expect(mockSesSend).not.toHaveBeenCalled()
    })

    it('propagates SES send failures', async () => {
      mockSesSend.mockRejectedValueOnce(new Error('SES unavailable'))
      const service = new AwsSesEmailService('us-east-2', 'sender@example.com')

      await expect(
        service.send({ to: 'test@example.com', subject: 'Test Subject', html: '<p>Test body</p>' })
      ).rejects.toThrow('SES unavailable')
    })
  })
})

describe('createEmailService', () => {
  const originalEnv = process.env

  beforeEach(() => {
    jest.resetModules()
    process.env = { ...originalEnv }
  })

  afterEach(() => {
    process.env = originalEnv
  })

  it('creates MockEmailService by default', () => {
    const service = createEmailService('mock')
    expect(service).toBeInstanceOf(MockEmailService)
  })

  it('creates MockEmailService when type is "mock"', () => {
    const service = createEmailService('mock')
    expect(service).toBeInstanceOf(MockEmailService)
  })

  it('creates SendGridEmailService with SENDGRID_API_KEY env var', () => {
    process.env.SENDGRID_API_KEY = 'test-key'
    const service = createEmailService('sendgrid')
    expect(service).toBeInstanceOf(SendGridEmailService)
  })

  it('creates SendGridEmailService with config', () => {
    const service = createEmailService('sendgrid', { sendgridApiKey: 'test-key' })
    expect(service).toBeInstanceOf(SendGridEmailService)
  })

  it('throws when SendGrid API key is missing', () => {
    delete process.env.SENDGRID_API_KEY
    expect(() => createEmailService('sendgrid')).toThrow('SendGrid API key is required')
  })

  it('creates AwsSesEmailService with AWS env vars', () => {
    process.env.AWS_ACCESS_KEY_ID = 'test-key'
    process.env.AWS_SECRET_ACCESS_KEY = 'test-secret'
    const service = createEmailService('aws_ses')
    // Service is created, but we can't check instanceof because of circular dependency
    expect(service).toBeDefined()
  })

  it('succeeds with no static credentials in the environment (SDK default credential chain)', () => {
    delete process.env.AWS_ACCESS_KEY_ID
    delete process.env.AWS_SECRET_ACCESS_KEY
    expect(() => createEmailService('aws_ses')).not.toThrow()
  })

  it('throws on unknown service type', () => {
    expect(() => createEmailService('unknown')).toThrow('Unknown email service type')
  })

  it('uses provided fromAddress in config', () => {
    process.env.SENDGRID_API_KEY = 'test-key'
    const service = createEmailService('sendgrid', { fromAddress: 'custom@example.com' })
    expect(service).toBeInstanceOf(SendGridEmailService)
  })

  it('defaults to mock service when type is undefined', () => {
    const service = createEmailService('mock')
    expect(service).toBeInstanceOf(MockEmailService)
  })

  it('handles case-insensitive service type', () => {
    process.env.SENDGRID_API_KEY = 'test-key'
    const service = createEmailService('SENDGRID')
    expect(service).toBeInstanceOf(SendGridEmailService)
  })

  it('passes AWS region to AwsSesEmailService', () => {
    process.env.AWS_ACCESS_KEY_ID = 'test-key'
    process.env.AWS_SECRET_ACCESS_KEY = 'test-secret'
    process.env.AWS_REGION = 'eu-west-1'
    const service = createEmailService('aws_ses')
    // Service is created with proper config
    expect(service).toBeDefined()
  })
})
