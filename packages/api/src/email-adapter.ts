export interface EmailAdapter {
  send(to: string, subject: string, body: string): Promise<void>
}

export class InMemoryEmailAdapter implements EmailAdapter {
  public sent: Array<{ to: string; subject: string; body: string }> = []

  async send(to: string, subject: string, body: string): Promise<void> {
    this.sent.push({ to, subject, body })
  }

  clear(): void {
    this.sent = []
  }

  getSentTo(email: string) {
    return this.sent.filter(e => e.to === email)
  }
}
