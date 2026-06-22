export type JobName =
  | 'standings.recalculate'
  | 'bracket.generate'
  | 'email.send'
  | 'messaging.partition.ensure'
  | 'messaging.partition.purge'

export type JobPayload = {
  'standings.recalculate': { tournamentId: string; groupId: string }
  'bracket.generate': { tournamentId: string }
  'email.send': { type: string; recipientIds: string[]; data: Record<string, unknown> }
  'messaging.partition.ensure': { monthsAhead?: number }
  'messaging.partition.purge': { retentionDays?: number; dropPaddingDays?: number; dryRun?: boolean }
}

export interface JobOptions {
  jobId?: string
  attempts?: number
  backoff?: { type: 'exponential' | 'fixed'; delay: number }
}

export interface EnqueuedJob<T = unknown> {
  id: string
  name: string
  data: T
  opts: JobOptions
  attemptsMade: number
  enqueuedAt: number
  lastError?: string
  failedReason?: string
}
