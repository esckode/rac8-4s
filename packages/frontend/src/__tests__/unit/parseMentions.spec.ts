import { parseMentions } from '../../utils/parseMentions'

describe('parseMentions', () => {
  it('returns a single text segment for a plain message', () => {
    expect(parseMentions('Hello world')).toEqual([{ type: 'text', text: 'Hello world' }])
  })

  it('parses @"Display Name" as a mention segment', () => {
    expect(parseMentions('@"Alice"')).toEqual([{ type: 'mention', text: '@"Alice"', name: 'Alice' }])
  })

  it('splits text + mention + text correctly', () => {
    expect(parseMentions('Hey @"Bob" how are you')).toEqual([
      { type: 'text', text: 'Hey ' },
      { type: 'mention', text: '@"Bob"', name: 'Bob' },
      { type: 'text', text: ' how are you' },
    ])
  })

  it('handles multiple mentions', () => {
    const result = parseMentions('@"Alice" and @"Bob"')
    expect(result).toHaveLength(3)
    expect(result[0]).toEqual({ type: 'mention', text: '@"Alice"', name: 'Alice' })
    expect(result[1]).toEqual({ type: 'text', text: ' and ' })
    expect(result[2]).toEqual({ type: 'mention', text: '@"Bob"', name: 'Bob' })
  })

  it('handles names with spaces', () => {
    const result = parseMentions('@"Jane Doe"')
    expect(result[0]).toEqual({ type: 'mention', text: '@"Jane Doe"', name: 'Jane Doe' })
  })

  it('returns empty array for empty string', () => {
    expect(parseMentions('')).toEqual([])
  })

  it('ignores bare @ without quotes', () => {
    expect(parseMentions('email@example.com')).toEqual([{ type: 'text', text: 'email@example.com' }])
  })
})
