import type { AppConfig } from '../config'
import { getLogger } from '../logger'

const log = getLogger('email-job-validator')

export interface EmailJobValidationResult {
  valid: boolean
  error?: string
  recipientCount?: number
  duplicateCount?: number
}

export function validateEmailJobPayload(
  payload: {
    recipientIds: string[]
  },
  config: AppConfig
): EmailJobValidationResult {
  const { recipientIds } = payload
  const recipientCount = recipientIds.length
  const distinctCount = new Set(recipientIds).size
  const duplicateCount = recipientCount - distinctCount
  const maxLimit = config.limits.emailRecipientsPerJob
  const nearLimitThreshold = Math.floor(maxLimit * 0.8)

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

  if (recipientCount > maxLimit) {
    const result: EmailJobValidationResult = {
      valid: false,
      error: `Email job exceeds maximum recipients (${recipientCount} > ${maxLimit})`,
      recipientCount,
      duplicateCount,
    }
    log.warn('email.job.rejected', {
      reason: 'limit_exceeded',
      recipientCount,
      maxAllowed: maxLimit,
      excess: recipientCount - maxLimit,
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

  if (recipientCount >= nearLimitThreshold) {
    log.info('email.job.near_limit', {
      recipientCount,
      percentageOfLimit: Math.round((recipientCount / maxLimit) * 100),
    })
  }

  return {
    valid: true,
    recipientCount,
    duplicateCount: 0,
  }
}
