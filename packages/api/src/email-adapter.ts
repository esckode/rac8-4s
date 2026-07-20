import { getLogger } from './logger'

const log = getLogger('email-adapter')

export interface EmailAdapter {
  send(to: string, subject: string, body: string): Promise<void>
}

export interface EmailConfig {
  fromAddress: string
  frontendUrl: string
}

export class InMemoryEmailAdapter implements EmailAdapter {
  public sent: Array<{ to: string; subject: string; body: string }> = []

  async send(to: string, subject: string, body: string): Promise<void> {
    this.sent.push({ to, subject, body })
  }

  clear(): void {
    this.sent = []
  }

  getSentTo(email: string) {
    return this.sent.filter(e => e.to === email)
  }
}

/**
 * Send password reset email with code formatted as "12 34 56".
 * Logs success or failure but does not throw to allow endpoint to continue.
 *
 * @param emailAdapter - The email adapter to use for sending
 * @param config - Email configuration with fromAddress and frontendUrl
 * @param email - Recipient email address
 * @param code - 6-digit reset code
 * @param expirationMinutes - Code expiration time in minutes (typically 15)
 */
export async function sendPasswordResetEmail(
  emailAdapter: EmailAdapter,
  config: EmailConfig,
  email: string,
  code: string,
  expirationMinutes: number = 15
): Promise<void> {
  try {
    // Format code as "12 34 56" (groups of 2)
    const formattedCode = `${code.slice(0, 2)} ${code.slice(2, 4)} ${code.slice(4, 6)}`

    // Create reset link with email and code as query parameters
    const resetLink = `${config.frontendUrl}/reset-password?email=${encodeURIComponent(email)}&code=${code}`

    const subject = 'Reset Your Password'

    const html = `
      <h1>Password Reset Request</h1>
      <p>Hi,</p>
      <p>Here's your password reset code:</p>
      <h2 style="font-family: monospace; letter-spacing: 0.1em; font-size: 24px; margin: 20px 0;">${formattedCode}</h2>
      <p><a href="${resetLink}" style="display: inline-block; background-color: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Click here to reset your password</a></p>
      <p>This code expires in ${expirationMinutes} minutes.</p>
      <p><strong>Didn't request this?</strong> Ignore this email and your password will remain unchanged.</p>
    `

    // Send via email adapter
    await emailAdapter.send(email, subject, html)

    log.info('email.sent', { recipient: email, type: 'password_reset' })
  } catch (error) {
    log.error('email.send_failed', {
      recipient: email,
      error: error instanceof Error ? error.message : String(error),
    })
    // Don't throw - allow endpoint to continue
  }
}

/**
 * Send the magic-link registration email for a tournament.
 * Logs success or failure but does not throw to allow the register
 * endpoint to continue (the response body still carries the token).
 *
 * @param emailAdapter - The email adapter to use for sending
 * @param config - Email configuration with fromAddress and frontendUrl
 * @param email - Recipient (registering player's) email address
 * @param token - The magic-link token
 * @param tournamentId - The tournament being registered for (log context only)
 * @param tournamentName - Tournament name, shown in the email
 */
export async function sendMagicLinkEmail(
  emailAdapter: EmailAdapter,
  config: EmailConfig,
  email: string,
  token: string,
  tournamentId: string,
  tournamentName: string
): Promise<void> {
  try {
    const registrationLink = `${config.frontendUrl}/signup?token=${encodeURIComponent(token)}`

    const subject = `Complete your registration for ${tournamentName}`

    const html = `
      <h1>You're registered!</h1>
      <p>Hi,</p>
      <p>Click the link below to complete your registration for <strong>${tournamentName}</strong>:</p>
      <p><a href="${registrationLink}" style="display: inline-block; background-color: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Complete registration</a></p>
      <p>Or copy this URL: ${registrationLink}</p>
    `

    // Send via email adapter
    await emailAdapter.send(email, subject, html)

    // No recipient in logs, per CLAUDE.md §6 (PII beyond IDs) — see P0.9.
    log.info('email.sent', { tournamentId, type: 'magic_link' })
  } catch (error) {
    log.error('email.send_failed', {
      tournamentId,
      type: 'magic_link',
      error: error instanceof Error ? error.message : String(error),
    })
    // Don't throw - allow endpoint to continue
  }
}
