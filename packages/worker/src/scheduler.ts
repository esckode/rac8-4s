export interface SchedulerHandlerContext {
  now: Date
}

export type SchedulerHandler = (ctx: SchedulerHandlerContext) => Promise<void>

export class InMemoryScheduler {
  private handlers = new Map<string, SchedulerHandler>()

  register(name: string, handler: SchedulerHandler): void {
    this.handlers.set(name, handler)
  }

  async fire(name: string, opts?: { now?: Date }): Promise<void> {
    const h = this.handlers.get(name)
    if (!h) throw new Error(`No handler '${name}' registered`)
    await h({ now: opts?.now ?? new Date() })
  }

  async tick(opts?: { now?: Date }): Promise<void> {
    const now = opts?.now ?? new Date()
    for (const h of this.handlers.values()) {
      await h({ now })
    }
  }

  registeredNames(): string[] {
    return [...this.handlers.keys()]
  }
}
