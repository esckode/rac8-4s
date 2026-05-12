import { MAX_EMAIL_RECIPIENTS_PER_JOB } from '../constants'
import { getLogger } from '../logger'

const log = getLogger('email-job-validator')

export interface EmailJobValidationResult {
  valid: boolean
  error?: string
  recipientCount?: number
  duplicateCount?: number
}

export function validateEmailJobPayload(payload: {
  recipientIds: string[]
}): EmailJobValidationResult {
  const { recipientIds } = payload
  const recipientCount = recipientIds.length
  const distinctCount = new Set(recipientIds).size
  const duplicateCount = recipientCount - distinctCount

  if (recipientCount === 0) {
    const result: EmailJobValidationResult = {
      valid: false,
      error: 'Email job must have at least one recipient',
      recipientCount,
      duplicateCount: 0,
    }
    log.warn('email.job.rejected', {
      reason: 'no_recipients',
      recipientCount,
    })
    return result
  }

  if (recipientCount > MAX_EMAIL_RECIPIENTS_PER_JOB) {
    const result: EmailJobValidationResult = {
      valid: false,
      error: `Email job exceeds maximum recipients (${recipientCount} > ${MAX_EMAIL_RECIPIENTS_PER_JOB})`,
      recipientCount,
      duplicateCount,
    }
    log.warn('email.job.rejected', {
      reason: 'limit_exceeded',
      recipientCount,
      maxAllowed: MAX_EMAIL_RECIPIENTS_PER_JOB,
      excess: recipientCount - MAX_EMAIL_RECIPIENTS_PER_JOB,
    })
    return result
  }

  if (duplicateCount > 0) {
    const result: EmailJobValidationResult = {
      valid: false,
      error: `Email job contains ${duplicateCount} duplicate recipient(s)`,
      recipientCount,
      duplicateCount,
    }
    log.warn('email.job.rejected', {
      reason: 'duplicate_recipients',
      recipientCount,
      duplicateCount,
    })
    return result
  }

  if (recipientCount >= 800) {
    log.info('email.job.near_limit', {
      recipientCount,
      percentageOfLimit: Math.round((recipientCount / MAX_EMAIL_RECIPIENTS_PER_JOB) * 100),
    })
  }

  return {
    valid: true,
    recipientCount,
    duplicateCount: 0,
  }
}
