export type JobName =
  | 'standings.recalculate'
  | 'bracket.generate'
  | 'email.send'
  | 'websocket.broadcast'

export type JobPayload = {
  'standings.recalculate': { tournamentId: string; groupId: string }
  'bracket.generate': { tournamentId: string }
  'email.send': { type: string; recipientIds: string[]; data: Record<string, unknown> }
  'websocket.broadcast': { tournamentId: string; event: string; data: Record<string, unknown> }
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
  failedReason?: string
  attemptsMade: number
}
