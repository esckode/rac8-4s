import { InMemoryEmailAdapter, sendPasswordResetEmail, EmailConfig } from '../../email-adapter'

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

describe('sendPasswordResetEmail', () => {
  let adapter: InMemoryEmailAdapter
  let config: EmailConfig

  beforeEach(() => {
    adapter = new InMemoryEmailAdapter()
    config = {
      fromAddress: 'noreply@test.local',
      frontendUrl: 'https://app.test.local',
    }
  })

  describe('Email formatting and content', () => {
    it('formats code as "12 34 56" (groups of 2)', async () => {
      const code = '123456'
      const email = 'user@example.com'

      await sendPasswordResetEmail(adapter, config, email, code, 15)

      expect(adapter.sent).toHaveLength(1)
      const sent = adapter.sent[0]
      expect(sent.body).toContain('12 34 56')
    })

    it('includes reset link with email and code as query parameters', async () => {
      const code = '654321'
      const email = 'test@example.com'

      await sendPasswordResetEmail(adapter, config, email, code, 15)

      expect(adapter.sent).toHaveLength(1)
      const sent = adapter.sent[0]
      expect(sent.body).toContain('reset-password')
      expect(sent.body).toContain(`email=${encodeURIComponent(email)}`)
      expect(sent.body).toContain(`code=${code}`)
    })

    it('uses frontendUrl from config in reset link', async () => {
      const customUrl = 'https://custom.example.com'
      config.frontendUrl = customUrl
      const code = '111111'
      const email = 'user@test.com'

      await sendPasswordResetEmail(adapter, config, email, code, 15)

      const sent = adapter.sent[0]
      expect(sent.body).toContain(`${customUrl}/reset-password`)
    })

    it('includes expiration time in email body', async () => {
      const code = '222222'
      const email = 'user@example.com'
      const expirationMinutes = 15

      await sendPasswordResetEmail(adapter, config, email, code, expirationMinutes)

      const sent = adapter.sent[0]
      expect(sent.body).toContain(`${expirationMinutes} minutes`)
    })

    it('includes security note about ignoring email', async () => {
      const code = '333333'
      const email = 'user@example.com'

      await sendPasswordResetEmail(adapter, config, email, code, 15)

      const sent = adapter.sent[0]
      expect(sent.body).toContain("Didn't request this")
      expect(sent.body).toContain('Ignore this email')
    })

    it('includes greeting with "Hi" in email body', async () => {
      const code = '444444'
      const email = 'user@example.com'

      await sendPasswordResetEmail(adapter, config, email, code, 15)

      const sent = adapter.sent[0]
      expect(sent.body).toContain('Hi')
    })

    it('sets subject to "Reset Your Password"', async () => {
      const code = '555555'
      const email = 'user@example.com'

      await sendPasswordResetEmail(adapter, config, email, code, 15)

      const sent = adapter.sent[0]
      expect(sent.subject).toBe('Reset Your Password')
    })

    it('sends HTML email with proper formatting', async () => {
      const code = '666666'
      const email = 'user@example.com'

      await sendPasswordResetEmail(adapter, config, email, code, 15)

      const sent = adapter.sent[0]
      expect(sent.body).toContain('<h1>')
      expect(sent.body).toContain('<h2')
      expect(sent.body).toContain('<p>')
      expect(sent.body).toContain('<a')
    })
  })

  describe('Different code formats', () => {
    it('formats code 000000 as "00 00 00"', async () => {
      await sendPasswordResetEmail(adapter, config, 'test@example.com', '000000', 15)
      expect(adapter.sent[0].body).toContain('00 00 00')
    })

    it('formats code 999999 as "99 99 99"', async () => {
      await sendPasswordResetEmail(adapter, config, 'test@example.com', '999999', 15)
      expect(adapter.sent[0].body).toContain('99 99 99')
    })

    it('formats code 101010 as "10 10 10"', async () => {
      await sendPasswordResetEmail(adapter, config, 'test@example.com', '101010', 15)
      expect(adapter.sent[0].body).toContain('10 10 10')
    })
  })

  describe('Different expiration times', () => {
    it('includes custom expiration time of 20 minutes', async () => {
      await sendPasswordResetEmail(adapter, config, 'test@example.com', '123456', 20)
      expect(adapter.sent[0].body).toContain('20 minutes')
    })

    it('includes custom expiration time of 5 minutes', async () => {
      await sendPasswordResetEmail(adapter, config, 'test@example.com', '123456', 5)
      expect(adapter.sent[0].body).toContain('5 minutes')
    })

    it('uses default 15 minutes when not specified', async () => {
      await sendPasswordResetEmail(adapter, config, 'test@example.com', '123456')
      expect(adapter.sent[0].body).toContain('15 minutes')
    })
  })

  describe('Email sending', () => {
    it('sends email via adapter', async () => {
      const email = 'test@example.com'
      const code = '123456'

      await sendPasswordResetEmail(adapter, config, email, code, 15)

      expect(adapter.sent).toHaveLength(1)
      expect(adapter.sent[0].to).toBe(email)
    })

    it('uses correct recipient email', async () => {
      const email = 'user+test@example.com'
      const code = '123456'

      await sendPasswordResetEmail(adapter, config, email, code, 15)

      expect(adapter.sent[0].to).toBe(email)
    })
  })

  describe('Graceful error handling', () => {
    it('does not throw on adapter error', async () => {
      const failingAdapter = {
        send: jest.fn().mockRejectedValue(new Error('SMTP connection failed')),
      }

      // Should not throw - function completes silently
      await expect(
        sendPasswordResetEmail(failingAdapter as any, config, 'test@example.com', '123456', 15)
      ).resolves.toBeUndefined()
    })

    it('catches error when adapter.send rejects', async () => {
      const failingAdapter = {
        send: jest.fn().mockRejectedValue(new Error('Email service unavailable')),
      }

      // Should not throw even with rejection
      await sendPasswordResetEmail(failingAdapter as any, config, 'test@example.com', '123456', 15)

      // Verify adapter was called
      expect(failingAdapter.send).toHaveBeenCalled()
    })

    it('handles non-Error rejection values', async () => {
      const failingAdapter = {
        send: jest.fn().mockRejectedValue('Unknown error string'),
      }

      // Should not throw
      await sendPasswordResetEmail(failingAdapter as any, config, 'test@example.com', '123456', 15)

      expect(failingAdapter.send).toHaveBeenCalled()
    })
  })

  describe('URL encoding', () => {
    it('properly encodes email with special characters in reset link', async () => {
      const email = 'user+test@example.com'
      const code = '123456'

      await sendPasswordResetEmail(adapter, config, email, code, 15)

      const sent = adapter.sent[0]
      expect(sent.body).toContain(encodeURIComponent(email))
    })

    it('includes unencoded code in reset link', async () => {
      const code = '123456'
      const email = 'test@example.com'

      await sendPasswordResetEmail(adapter, config, email, code, 15)

      const sent = adapter.sent[0]
      // Code should be plain (not encoded, since it's just digits)
      expect(sent.body).toContain(`code=${code}`)
    })
  })

  describe('Multiple emails', () => {
    it('can send multiple emails independently', async () => {
      const email1 = 'user1@example.com'
      const email2 = 'user2@example.com'
      const code1 = '111111'
      const code2 = '222222'

      await sendPasswordResetEmail(adapter, config, email1, code1, 15)
      await sendPasswordResetEmail(adapter, config, email2, code2, 15)

      expect(adapter.sent).toHaveLength(2)
      expect(adapter.sent[0].to).toBe(email1)
      expect(adapter.sent[1].to).toBe(email2)
      expect(adapter.sent[0].body).toContain('11 11 11')
      expect(adapter.sent[1].body).toContain('22 22 22')
    })

    it('sends email with correct code for each recipient', async () => {
      const code = '333333'

      await sendPasswordResetEmail(adapter, config, 'alice@example.com', code, 15)
      await sendPasswordResetEmail(adapter, config, 'bob@example.com', code, 15)

      expect(adapter.sent[0].body).toContain('33 33 33')
      expect(adapter.sent[1].body).toContain('33 33 33')
    })
  })

  describe('Edge cases', () => {
    it('handles code with leading zeros', async () => {
      await sendPasswordResetEmail(adapter, config, 'test@example.com', '001234', 15)
      expect(adapter.sent[0].body).toContain('00 12 34')
    })

    it('handles very short expiration time', async () => {
      await sendPasswordResetEmail(adapter, config, 'test@example.com', '123456', 1)
      expect(adapter.sent[0].body).toContain('1 minutes')
    })

    it('handles very long expiration time', async () => {
      await sendPasswordResetEmail(adapter, config, 'test@example.com', '123456', 1440)
      expect(adapter.sent[0].body).toContain('1440 minutes')
    })

    it('handles reset link with localhost frontend URL', async () => {
      config.frontendUrl = 'http://localhost:3000'
      await sendPasswordResetEmail(adapter, config, 'test@example.com', '123456', 15)
      expect(adapter.sent[0].body).toContain('http://localhost:3000/reset-password')
    })

    it('handles reset link with port in frontend URL', async () => {
      config.frontendUrl = 'https://app.example.com:8443'
      await sendPasswordResetEmail(adapter, config, 'test@example.com', '123456', 15)
      expect(adapter.sent[0].body).toContain('https://app.example.com:8443/reset-password')
    })
  })
})
