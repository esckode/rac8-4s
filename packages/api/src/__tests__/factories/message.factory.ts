import crypto from 'crypto'

export interface MessageData {
  tournamentId: string
  senderPlayerId: string
  body: string
  recipientPlayerId?: string
  matchId?: string
}

export const MessageFactory = {
  uid(): string {
    return crypto.randomUUID().slice(0, 8)
  },

  data(overrides: Partial<MessageData> & Pick<MessageData, 'tournamentId' | 'senderPlayerId'>): MessageData {
    return {
      body: `Test message body ${this.uid()}`,
      ...overrides,
    }
  },
}
