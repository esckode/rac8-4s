import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2'
import { getLogger } from '../logger'

const log = getLogger('email-service')

export interface EmailSendOptions {
  to: string
  subject: string
  html: string
  text?: string
  from?: string
}

export interface IEmailService {
  send(options: EmailSendOptions): Promise<void>
}

/**
 * Validates email address format.
 * Simple validation - checks for basic RFC 5322 compliance.
 */
function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(email)
}

/**
 * Mock email service for development and testing.
 * Logs emails to console instead of sending them.
 */
export class MockEmailService implements IEmailService {
  async send(options: EmailSendOptions): Promise<void> {
    if (!isValidEmail(options.to)) {
      throw new Error(`Invalid email address: ${options.to}`)
    }

    log.info('email.service.sent', {
      recipient: options.to,
      service: 'mock',
      subject: options.subject,
    })
  }
}

/**
 * SendGrid email service for production use.
 * Sends emails via SendGrid API v3.
 */
export class SendGridEmailService implements IEmailService {
  private apiKey: string
  private fromAddress: string

  constructor(apiKey: string, fromAddress: string = 'noreply@rac8-4s.local') {
    if (!apiKey) {
      throw new Error('SendGrid API key is required')
    }
    this.apiKey = apiKey
    this.fromAddress = fromAddress
  }

  async send(options: EmailSendOptions): Promise<void> {
    if (!isValidEmail(options.to)) {
      throw new Error(`Invalid email address: ${options.to}`)
    }

    const from = options.from || this.fromAddress

    try {
      const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          personalizations: [
            {
              to: [{ email: options.to }],
            },
          ],
          from: { email: from },
          subject: options.subject,
          content: [
            {
              type: 'text/html',
              value: options.html,
            },
          ],
          ...(options.text && {
            content: [
              { type: 'text/html', value: options.html },
              { type: 'text/plain', value: options.text },
            ],
          }),
        }),
      })

      if (!response.ok) {
        const errorBody = await response.text().catch(() => 'Unknown error')
        throw new Error(`SendGrid API error: ${response.status} ${errorBody}`)
      }

      log.info('email.service.sent', { service: 'sendgrid' })
    } catch (error) {
      log.error('email.service.failed', {
        service: 'sendgrid',
        error: error instanceof Error ? error.message : String(error),
      })
      throw error
    }
  }
}

/**
 * AWS SES email service for production use.
 * Sends emails via AWS SES (SESv2) API.
 * Credentials come from the SDK's default credential chain (e.g. an EC2
 * instance role) — this class never accepts or stores a static key/secret.
 */
export class AwsSesEmailService implements IEmailService {
  private client: SESv2Client
  private fromAddress: string

  constructor(region: string = 'us-east-1', fromAddress: string = 'noreply@rac8-4s.local') {
    this.client = new SESv2Client({ region })
    this.fromAddress = fromAddress
  }

  async send(options: EmailSendOptions): Promise<void> {
    if (!isValidEmail(options.to)) {
      throw new Error(`Invalid email address: ${options.to}`)
    }

    const from = options.from || this.fromAddress

    try {
      await this.client.send(
        new SendEmailCommand({
          FromEmailAddress: from,
          Destination: { ToAddresses: [options.to] },
          Content: {
            Simple: {
              Subject: { Data: options.subject },
              Body: {
                Html: { Data: options.html },
                ...(options.text && { Text: { Data: options.text } }),
              },
            },
          },
        })
      )

      // P0.9: no recipient, no subject — see CLAUDE.md §6 (PII beyond IDs).
      log.info('email.service.sent', { service: 'aws_ses' })
    } catch (error) {
      log.error('email.service.failed', {
        service: 'aws_ses',
        error: error instanceof Error ? error.message : String(error),
      })
      throw error
    }
  }
}

/**
 * Factory function to create an email service based on configuration.
 * @param serviceType - The type of service: 'mock', 'sendgrid', or 'aws_ses'
 * @param config - Service-specific configuration
 * @returns An instance of IEmailService
 */
export function createEmailService(
  serviceType: string = 'mock',
  config?: Record<string, string | undefined>
): IEmailService {
  const fromAddress = config?.fromAddress || 'noreply@rac8-4s.local'

  switch (serviceType.toLowerCase()) {
    case 'mock':
      return new MockEmailService()

    case 'sendgrid':
      {
        const apiKey = config?.sendgridApiKey || process.env.SENDGRID_API_KEY
        if (!apiKey) {
          throw new Error(
            'SendGrid API key is required. Set SENDGRID_API_KEY environment variable or provide via config.'
          )
        }
        return new SendGridEmailService(apiKey, fromAddress)
      }

    case 'aws_ses':
      {
        const region = config?.awsRegion || process.env.AWS_REGION || 'us-east-1'

        return new AwsSesEmailService(region, fromAddress)
      }

    default:
      throw new Error(`Unknown email service type: ${serviceType}`)
  }
}
