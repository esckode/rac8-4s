import crypto from 'crypto'

export interface AnalyticsEventData {
  timestamp: number
  userId: string
  eventType: string
  screen?: string
  duration?: number
  data?: Record<string, any>
}

export interface AnalyticsEventBatch {
  events: AnalyticsEventData[]
}

export const AnalyticsFactory = {
  uid(): string {
    return crypto.randomUUID().slice(0, 8)
  },

  event(overrides: Partial<AnalyticsEventData> = {}): AnalyticsEventData {
    const uid = this.uid()
    return {
      timestamp: Date.now(),
      userId: `player-${uid}`,
      eventType: 'page_view',
      screen: '/tournaments',
      ...overrides,
    }
  },

  batch(eventCount: number = 1, overrides: Partial<AnalyticsEventData> = {}): AnalyticsEventBatch {
    const events: AnalyticsEventData[] = []
    for (let i = 0; i < eventCount; i++) {
      events.push(this.event({ ...overrides, eventType: overrides.eventType || `event_${i}` }))
    }
    return { events }
  },

  screenViewEvent(screen: string, overrides: Partial<AnalyticsEventData> = {}): AnalyticsEventData {
    return this.event({
      eventType: 'page_view',
      screen,
      ...overrides,
    })
  },

  buttonClickEvent(buttonName: string, overrides: Partial<AnalyticsEventData> = {}): AnalyticsEventData {
    return this.event({
      eventType: 'button_click',
      data: { buttonName },
      ...overrides,
    })
  },

  formSubmitEvent(formName: string, overrides: Partial<AnalyticsEventData> = {}): AnalyticsEventData {
    return this.event({
      eventType: 'form_submit',
      data: { formName },
      ...overrides,
    })
  },

  timedEvent(duration: number, overrides: Partial<AnalyticsEventData> = {}): AnalyticsEventData {
    return this.event({
      eventType: 'user_session',
      duration,
      ...overrides,
    })
  },

  customEvent(eventType: string, data: Record<string, any> = {}, overrides: Partial<AnalyticsEventData> = {}): AnalyticsEventData {
    return this.event({
      eventType,
      data,
      ...overrides,
    })
  },
}
