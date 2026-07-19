import { notificationUnreadStore } from '../notification-unread-state'

describe('notificationUnreadStore', () => {
  afterEach(() => {
    notificationUnreadStore.clear()
  })

  it('starts at 0', () => {
    expect(notificationUnreadStore.get()).toBe(0)
  })

  it('set() replaces the count and notifies subscribers', () => {
    const spy = jest.fn()
    const unsub = notificationUnreadStore.subscribe(spy)
    notificationUnreadStore.set(3)
    expect(notificationUnreadStore.get()).toBe(3)
    expect(spy).toHaveBeenCalledWith(3)
    unsub()
  })

  it('increment() adds one and notifies', () => {
    notificationUnreadStore.set(1)
    const spy = jest.fn()
    const unsub = notificationUnreadStore.subscribe(spy)
    notificationUnreadStore.increment()
    expect(notificationUnreadStore.get()).toBe(2)
    expect(spy).toHaveBeenCalledWith(2)
    unsub()
  })

  it('clear() resets to 0 and notifies', () => {
    notificationUnreadStore.set(5)
    const spy = jest.fn()
    const unsub = notificationUnreadStore.subscribe(spy)
    notificationUnreadStore.clear()
    expect(notificationUnreadStore.get()).toBe(0)
    expect(spy).toHaveBeenCalledWith(0)
    unsub()
  })

  it('unsubscribe stops further notifications', () => {
    const spy = jest.fn()
    const unsub = notificationUnreadStore.subscribe(spy)
    unsub()
    notificationUnreadStore.increment()
    expect(spy).not.toHaveBeenCalled()
  })
})
