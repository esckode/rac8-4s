export interface MentionSegment {
  type: 'text' | 'mention'
  text: string
  name?: string
}

export function parseMentions(body: string): MentionSegment[] {
  if (!body) return []
  const pattern = /@"([^"]+)"/g
  const result: MentionSegment[] = []
  let last = 0
  let match: RegExpExecArray | null
  while ((match = pattern.exec(body)) !== null) {
    if (match.index > last) {
      result.push({ type: 'text', text: body.slice(last, match.index) })
    }
    result.push({ type: 'mention', text: match[0], name: match[1] })
    last = match.index + match[0].length
  }
  if (last < body.length) {
    result.push({ type: 'text', text: body.slice(last) })
  }
  return result
}
