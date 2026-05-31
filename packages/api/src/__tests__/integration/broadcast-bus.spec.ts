import { BroadcastBus } from '../../broadcast-bus'

describe('BroadcastBus', () => {
  let bus: BroadcastBus

  beforeEach(() => {
    bus = new BroadcastBus()
  })

  describe('constructor', () => {
    it('creates a new BroadcastBus instance', () => {
      expect(bus).toBeInstanceOf(BroadcastBus)
    })

    it('sets max listeners to 0 to support many concurrent subscribers', () => {
      // The constructor calls setMaxListeners(0)
      // We can verify this by checking the internal emitter
      const emitter = (bus as any).emitter
      expect(emitter.getMaxListeners()).toBe(0)
    })
  })

  describe('emit', () => {
    it('emits event to subscribed listeners', () => {
      const listener = jest.fn()
      const tournamentId = 'tournament_123'
      const eventType = 'match.scored'
      const data = { matchId: 'match_1', score: '6-4' }

      bus.subscribe(tournamentId, listener)
      bus.emit(tournamentId, eventType, data)

      expect(listener).toHaveBeenCalledWith(eventType, data)
    })

    it('only sends to listeners subscribed to that tournament', () => {
      const listener1 = jest.fn()
      const listener2 = jest.fn()

      bus.subscribe('tournament_1', listener1)
      bus.subscribe('tournament_2', listener2)

      bus.emit('tournament_1', 'event', { data: 'test' })

      expect(listener1).toHaveBeenCalledTimes(1)
      expect(listener2).toHaveBeenCalledTimes(0)
    })

    it('sends to multiple listeners for same tournament', () => {
      const listener1 = jest.fn()
      const listener2 = jest.fn()
      const tournamentId = 'tournament_123'

      bus.subscribe(tournamentId, listener1)
      bus.subscribe(tournamentId, listener2)

      bus.emit(tournamentId, 'event', { data: 'test' })

      expect(listener1).toHaveBeenCalledTimes(1)
      expect(listener2).toHaveBeenCalledTimes(1)
    })

    it('transmits event type and data correctly', () => {
      const listener = jest.fn()
      const tournamentId = 'tournament_123'
      const eventType = 'standings.updated'
      const data = { groupId: 'group_1', standings: [{ playerId: 'p1', wins: 2 }] }

      bus.subscribe(tournamentId, listener)
      bus.emit(tournamentId, eventType, data)

      expect(listener).toHaveBeenCalledWith(eventType, data)
      expect(listener).toHaveBeenCalledWith(eventType, expect.objectContaining(data))
    })

    it('allows undefined data in events', () => {
      const listener = jest.fn()
      const tournamentId = 'tournament_123'

      bus.subscribe(tournamentId, listener)
      bus.emit(tournamentId, 'event', undefined)

      expect(listener).toHaveBeenCalledWith('event', undefined)
    })

    it('allows null data in events', () => {
      const listener = jest.fn()
      const tournamentId = 'tournament_123'

      bus.subscribe(tournamentId, listener)
      bus.emit(tournamentId, 'event', null)

      expect(listener).toHaveBeenCalledWith('event', null)
    })
  })

  describe('subscribe', () => {
    it('returns unsubscribe function', () => {
      const listener = jest.fn()
      const unsubscribe = bus.subscribe('tournament_1', listener)

      expect(typeof unsubscribe).toBe('function')
    })

    it('unsubscribe function removes listener', () => {
      const listener = jest.fn()
      const unsubscribe = bus.subscribe('tournament_1', listener)

      bus.emit('tournament_1', 'event', {})
      expect(listener).toHaveBeenCalledTimes(1)

      unsubscribe()

      bus.emit('tournament_1', 'event', {})
      expect(listener).toHaveBeenCalledTimes(1) // Still 1, not called again
    })

    it('allows multiple subscriptions to same tournament', () => {
      const listener1 = jest.fn()
      const listener2 = jest.fn()
      const listener3 = jest.fn()

      bus.subscribe('tournament_1', listener1)
      bus.subscribe('tournament_1', listener2)
      bus.subscribe('tournament_1', listener3)

      bus.emit('tournament_1', 'event', {})

      expect(listener1).toHaveBeenCalledTimes(1)
      expect(listener2).toHaveBeenCalledTimes(1)
      expect(listener3).toHaveBeenCalledTimes(1)
    })

    it('can subscribe same listener multiple times', () => {
      const listener = jest.fn()

      bus.subscribe('tournament_1', listener)
      bus.subscribe('tournament_1', listener)

      bus.emit('tournament_1', 'event', {})

      // Listener is called twice since it was subscribed twice
      expect(listener).toHaveBeenCalledTimes(2)
    })

    it('each subscription is independent', () => {
      const listener = jest.fn()
      const unsub1 = bus.subscribe('tournament_1', listener)
      const unsub2 = bus.subscribe('tournament_1', listener)

      bus.emit('tournament_1', 'event', {})
      expect(listener).toHaveBeenCalledTimes(2)

      unsub1()
      bus.emit('tournament_1', 'event', {})
      expect(listener).toHaveBeenCalledTimes(3) // One more from unsub2

      unsub2()
      bus.emit('tournament_1', 'event', {})
      expect(listener).toHaveBeenCalledTimes(3) // No change
    })
  })

  describe('listenerCount', () => {
    it('returns 0 for tournament with no listeners', () => {
      expect(bus.listenerCount('tournament_1')).toBe(0)
    })

    it('returns correct count after single subscription', () => {
      bus.subscribe('tournament_1', jest.fn())

      expect(bus.listenerCount('tournament_1')).toBe(1)
    })

    it('returns correct count after multiple subscriptions', () => {
      bus.subscribe('tournament_1', jest.fn())
      bus.subscribe('tournament_1', jest.fn())
      bus.subscribe('tournament_1', jest.fn())

      expect(bus.listenerCount('tournament_1')).toBe(3)
    })

    it('returns correct count after unsubscription', () => {
      const unsub1 = bus.subscribe('tournament_1', jest.fn())
      const unsub2 = bus.subscribe('tournament_1', jest.fn())
      bus.subscribe('tournament_1', jest.fn())

      expect(bus.listenerCount('tournament_1')).toBe(3)

      unsub1()
      expect(bus.listenerCount('tournament_1')).toBe(2)

      unsub2()
      expect(bus.listenerCount('tournament_1')).toBe(1)
    })

    it('tracks listeners per tournament independently', () => {
      bus.subscribe('tournament_1', jest.fn())
      bus.subscribe('tournament_1', jest.fn())
      bus.subscribe('tournament_2', jest.fn())

      expect(bus.listenerCount('tournament_1')).toBe(2)
      expect(bus.listenerCount('tournament_2')).toBe(1)
      expect(bus.listenerCount('tournament_3')).toBe(0)
    })

    it('handles same listener subscribed multiple times in count', () => {
      const listener = jest.fn()

      bus.subscribe('tournament_1', listener)
      bus.subscribe('tournament_1', listener)
      bus.subscribe('tournament_1', listener)

      expect(bus.listenerCount('tournament_1')).toBe(3)
    })
  })

  describe('Event broadcasting integration', () => {
    it('handles high volume of concurrent listeners without errors', () => {
      const listeners = Array.from({ length: 100 }, () => jest.fn())
      const tournamentId = 'tournament_123'

      listeners.forEach(listener => {
        bus.subscribe(tournamentId, listener)
      })

      bus.emit(tournamentId, 'event', { data: 'test' })

      listeners.forEach(listener => {
        expect(listener).toHaveBeenCalledTimes(1)
      })
    })

    it('supports multiple tournament channels simultaneously', () => {
      const tournaments = ['t1', 't2', 't3', 't4', 't5']
      const listeners = new Map<string, jest.Mock>()

      tournaments.forEach(tId => {
        const listener = jest.fn()
        listeners.set(tId, listener)
        bus.subscribe(tId, listener)
      })

      tournaments.forEach(tId => {
        bus.emit(tId, 'event', { tournament: tId })
      })

      tournaments.forEach(tId => {
        expect(listeners.get(tId)).toHaveBeenCalledWith('event', { tournament: tId })
        expect(listeners.get(tId)).toHaveBeenCalledTimes(1)
      })
    })

    it('listener receives all events for its tournament', () => {
      const listener = jest.fn()
      const tournamentId = 'tournament_123'

      bus.subscribe(tournamentId, listener)

      bus.emit(tournamentId, 'event1', { type: 1 })
      bus.emit(tournamentId, 'event2', { type: 2 })
      bus.emit(tournamentId, 'event3', { type: 3 })

      expect(listener).toHaveBeenCalledTimes(3)
      expect(listener).toHaveBeenNthCalledWith(1, 'event1', { type: 1 })
      expect(listener).toHaveBeenNthCalledWith(2, 'event2', { type: 2 })
      expect(listener).toHaveBeenNthCalledWith(3, 'event3', { type: 3 })
    })

    it('works with different data types', () => {
      const listener = jest.fn()
      const tournamentId = 'tournament_123'

      bus.subscribe(tournamentId, listener)

      // String
      bus.emit(tournamentId, 'event', 'string-data')
      // Number
      bus.emit(tournamentId, 'event', 42)
      // Object
      bus.emit(tournamentId, 'event', { key: 'value' })
      // Array
      bus.emit(tournamentId, 'event', [1, 2, 3])
      // Boolean
      bus.emit(tournamentId, 'event', true)

      expect(listener).toHaveBeenCalledTimes(5)
      expect(listener).toHaveBeenNthCalledWith(1, 'event', 'string-data')
      expect(listener).toHaveBeenNthCalledWith(2, 'event', 42)
      expect(listener).toHaveBeenNthCalledWith(3, 'event', { key: 'value' })
      expect(listener).toHaveBeenNthCalledWith(4, 'event', [1, 2, 3])
      expect(listener).toHaveBeenNthCalledWith(5, 'event', true)
    })
  })
})
