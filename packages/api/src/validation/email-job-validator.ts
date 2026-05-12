import { MAX_EMAIL_RECIPIENTS_PER_JOB } from '../constants'

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
    return {
      valid: false,
      error: 'Email job must have at least one recipient',
      recipientCount,
      duplicateCount: 0,
    }
  }

  if (recipientCount > MAX_EMAIL_RECIPIENTS_PER_JOB) {
    return {
      valid: false,
      error: `Email job exceeds maximum recipients (${recipientCount} > ${MAX_EMAIL_RECIPIENTS_PER_JOB})`,
      recipientCount,
      duplicateCount,
    }
  }

  if (duplicateCount > 0) {
    return {
      valid: false,
      error: `Email job contains ${duplicateCount} duplicate recipient(s)`,
      recipientCount,
      duplicateCount,
    }
  }

  return {
    valid: true,
    recipientCount,
    duplicateCount: 0,
  }
}
