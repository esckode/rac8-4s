import { InMemoryEmailAdapter } from '../../email-adapter'

describe('InMemoryEmailAdapter', () => {
  let adapter: InMemoryEmailAdapter

  beforeEach(() => {
    adapter = new InMemoryEmailAdapter()
  })

  describe('send', () => {
    it('sends email with subject, recipient, and body', async () => {
      const email = 'test@example.com'
      const subject = 'Test Subject'
      const body = '<p>Test email body</p>'

      await adapter.send(email, subject, body)

      expect(adapter.sent).toHaveLength(1)
      expect(adapter.sent[0]).toEqual({
        to: email,
        subject,
        body,
      })
    })

    it('stores multiple sent emails in order', async () => {
      await adapter.send('user1@example.com', 'Subject 1', 'Body 1')
      await adapter.send('user2@example.com', 'Subject 2', 'Body 2')
      await adapter.send('user3@example.com', 'Subject 3', 'Body 3')

      expect(adapter.sent).toHaveLength(3)
      expect(adapter.sent[0].to).toBe('user1@example.com')
      expect(adapter.sent[1].to).toBe('user2@example.com')
      expect(adapter.sent[2].to).toBe('user3@example.com')
    })

    it('handles emails with empty body', async () => {
      const email = 'test@example.com'
      const subject = 'Empty Body'
      const body = ''

      await adapter.send(email, subject, body)

      expect(adapter.sent).toHaveLength(1)
      expect(adapter.sent[0].body).toBe('')
    })

    it('handles emails with special characters in subject and body', async () => {
      const email = 'test@example.com'
      const subject = 'Special Chars: !@#$%^&*()'
      const body = '<p>Body with émojis 🎉 and symbols</p>'

      await adapter.send(email, subject, body)

      expect(adapter.sent).toHaveLength(1)
      expect(adapter.sent[0].subject).toBe(subject)
      expect(adapter.sent[0].body).toBe(body)
    })
  })

  describe('clear', () => {
    it('clears all sent emails', async () => {
      await adapter.send('user1@example.com', 'Subject 1', 'Body 1')
      await adapter.send('user2@example.com', 'Subject 2', 'Body 2')

      expect(adapter.sent).toHaveLength(2)

      adapter.clear()

      expect(adapter.sent).toHaveLength(0)
    })

    it('allows sending new emails after clear', async () => {
      await adapter.send('user1@example.com', 'Subject 1', 'Body 1')
      adapter.clear()

      await adapter.send('user2@example.com', 'Subject 2', 'Body 2')

      expect(adapter.sent).toHaveLength(1)
      expect(adapter.sent[0].to).toBe('user2@example.com')
    })
  })

  describe('getSentTo', () => {
    beforeEach(async () => {
      await adapter.send('alice@example.com', 'Hello Alice', 'Hi Alice!')
      await adapter.send('bob@example.com', 'Hello Bob', 'Hi Bob!')
      await adapter.send('alice@example.com', 'Another Email', 'More content')
      await adapter.send('charlie@example.com', 'Hello Charlie', 'Hi Charlie!')
    })

    it('returns all emails sent to a specific recipient', () => {
      const sentToAlice = adapter.getSentTo('alice@example.com')

      expect(sentToAlice).toHaveLength(2)
      expect(sentToAlice[0]).toEqual({
        to: 'alice@example.com',
        subject: 'Hello Alice',
        body: 'Hi Alice!',
      })
      expect(sentToAlice[1]).toEqual({
        to: 'alice@example.com',
        subject: 'Another Email',
        body: 'More content',
      })
    })

    it('returns empty array if no emails sent to recipient', () => {
      const sentToUnknown = adapter.getSentTo('unknown@example.com')

      expect(sentToUnknown).toEqual([])
    })

    it('returns emails in sent order', () => {
      const sentToAlice = adapter.getSentTo('alice@example.com')

      expect(sentToAlice[0].subject).toBe('Hello Alice')
      expect(sentToAlice[1].subject).toBe('Another Email')
    })

    it('filters by exact email match', () => {
      const sentToAlice = adapter.getSentTo('alice@example.com')
      const sentToAliceVariant = adapter.getSentTo('Alice@example.com')

      expect(sentToAlice).toHaveLength(2)
      expect(sentToAliceVariant).toHaveLength(0)
    })
  })

  describe('initialization', () => {
    it('initializes with empty sent array', () => {
      const newAdapter = new InMemoryEmailAdapter()

      expect(newAdapter.sent).toEqual([])
    })

    it('has send method that returns a promise', () => {
      expect(typeof adapter.send).toBe('function')
      const result = adapter.send('test@example.com', 'Subject', 'Body')
      expect(result instanceof Promise).toBe(true)
    })

    it('has clear method', () => {
      expect(typeof adapter.clear).toBe('function')
    })

    it('has getSentTo method', () => {
      expect(typeof adapter.getSentTo).toBe('function')
    })
  })
})
