import { getLogger } from './logger'
import type { EmailAdapter } from './email-adapter'
import type { IEmailService } from './services/email-service'

const log = getLogger('email-service-adapter')

/**
 * Email adapter that delegates to an email service for actual sending.
 * This bridges the existing EmailAdapter interface with the new IEmailService interface.
 */
export class ServiceEmailAdapter implements EmailAdapter {
  constructor(private emailService: IEmailService, private fromAddress: string = 'noreply@rac8-4s.local') {}

  async send(to: string, subject: string, body: string): Promise<void> {
    try {
      await this.emailService.send({
        to,
        subject,
        html: body,
        from: this.fromAddress,
      })
    } catch (error) {
      log.error('email.adapter.send_failed', {
        error: error instanceof Error ? error.message : String(error),
      })
      throw error
    }
  }
}
