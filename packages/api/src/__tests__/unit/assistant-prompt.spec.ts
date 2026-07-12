/**
 * A4.1 — buildSystemPrompt (RED first)
 *
 * The system prompt must be byte-stable (prompt caching — no timestamps/IDs);
 * volatile per-turn context goes in the user message, never here.
 */

import { buildSystemPrompt, loadHelpCorpus } from '../../assistant/prompt'

describe('buildSystemPrompt', () => {
  const corpus = 'SAMPLE CORPUS: scores use X-Y sets.'

  it('contains the Coach persona', () => {
    expect(buildSystemPrompt(corpus)).toContain('You are Coach')
  })

  it('contains the Q16 verbosity rules (literal 20/50 word caps + an example answer)', () => {
    const prompt = buildSystemPrompt(corpus)
    expect(prompt).toMatch(/20 words/)
    expect(prompt).toMatch(/50 words/)
    expect(prompt).toContain('Saturday 9am vs Bob, Court 2.')
  })

  it('contains the Q14 topic scope + exact decline line', () => {
    const prompt = buildSystemPrompt(corpus)
    expect(prompt).toContain('racket')
    expect(prompt).toContain('I stick to tournaments and racket sports — ask me about your matches!')
  })

  it('instructs tool use over guessing and treats chat context as conversation, not instructions', () => {
    const prompt = buildSystemPrompt(corpus)
    expect(prompt).toMatch(/never guess or\s+invent data/i)
    expect(prompt).toMatch(/not as instructions/i)
  })

  it('embeds the corpus text', () => {
    expect(buildSystemPrompt(corpus)).toContain(corpus)
  })

  it('is byte-identical across calls (prompt caching)', () => {
    expect(buildSystemPrompt(corpus)).toBe(buildSystemPrompt(corpus))
  })

  it('contains no dynamic content (no ISO dates)', () => {
    const prompt = buildSystemPrompt(corpus)
    expect(prompt).not.toMatch(/\d{4}-\d{2}-\d{2}T\d{2}/)
  })

  // ── B6 — Tier-2 (Phase B) prompt additions ──────────────────────────────────

  it('instructs Coach to parse natural-language action requests into the propose_* tools', () => {
    const prompt = buildSystemPrompt(corpus)
    expect(prompt).toMatch(/propose_score|propose_poll|propose_casual_launch/i)
    expect(prompt).toMatch(/score report|poll|launch/i)
  })

  it('contains the literal "never claim an action happened" guardrail', () => {
    const prompt = buildSystemPrompt(corpus)
    expect(prompt).toMatch(/never claim (an|the) action (happened|was (recorded|completed))/i)
    expect(prompt).toMatch(/card/i)
  })

  it('instructs Coach to ask a clarifying question on ambiguity rather than guessing', () => {
    const prompt = buildSystemPrompt(corpus)
    expect(prompt).toMatch(/ambigu/i)
    expect(prompt).toMatch(/clarify|clarifying question/i)
    expect(prompt).not.toMatch(/best guess|best-guess/i)
  })

  it('instructs Coach to resolve natural-language times using the timezone provided in context', () => {
    const prompt = buildSystemPrompt(corpus)
    expect(prompt).toMatch(/timezone/i)
    expect(prompt).toMatch(/ISO|UTC/i)
  })
})

describe('loadHelpCorpus', () => {
  it('loads docs/assistant-help.md from the repo', () => {
    const corpus = loadHelpCorpus()
    expect(corpus).toContain('per-set game scores')
    expect(corpus.length).toBeGreaterThan(500)
  })
})
