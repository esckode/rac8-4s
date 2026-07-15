/**
 * @jest-environment node
 *
 * This suite runs ESLint programmatically against in-memory fixtures — no
 * DOM needed. Forced to the node environment because jsdom's global scope
 * lacks `structuredClone`, which @typescript-eslint/no-redeclare's rule
 * loader calls into (added when tools.ts's getGroupAvailability overloads
 * needed the rule turned on) — that call only fails under jsdom, not in a
 * real Node process (npx eslint) or here once forced back to node.
 */
import { lintText } from '../../lint/lint-text'

const CLEAN_FIXTURE = `import React from 'react'

interface GreetingProps {
  name: string
}

export function Greeting({ name }: GreetingProps) {
  return <div>Hello, {name}!</div>
}
`

const DIRTY_FIXTURE = `export function dangerous(input: string): unknown {
  return eval(input)
}
`

const REACT_FC_FIXTURE = `import { useState } from 'react'

const Foo: React.FC = () => {
  useState(0)
  return <div />
}

export default Foo
`

const NODEJS_TIMEOUT_FIXTURE = `let t: NodeJS.Timeout

export function setTimer(): void {
  t = setTimeout(() => {}, 1000)
}

export { t }
`

const USELESS_ESCAPE_FIXTURE = `export const s = "test\\!"
`

const USELESS_CATCH_FIXTURE = `export function f(): void {
  // noop
}

export function g(): void {
  try {
    f()
  } catch (e) {
    throw e
  }
}
`

const EMPTY_BLOCK_FIXTURE = `export function h(): void {
  try {
    throw new Error('boom')
  } catch (e) {}
}
`

const HEX_CLASSNAME_FIXTURE = `const a = <div className="bg-[#fff]" />
`

const HEX_STYLE_STRING_FIXTURE = `const b = <div style={{ color: '#FFF' }} />
`

const HEX_6_DIGIT_FIXTURE = `const c = <div className="text-[#1a1a1a]" />
`

const RGBA_STYLE_FIXTURE = `const d = <div style={{ background: 'rgba(0,0,0,0.5)' }} />
`

const HSL_STRING_FIXTURE = `const e = 'hsl(210 100% 50%)'
`

const CSS_VAR_CLASSNAME_FIXTURE = `const f = <div className="text-[--ink-900] bg-[--court-500]" />
`

const CSS_VAR_STYLE_FIXTURE = `const g = <div style={{ color: 'var(--ink-900)' }} />
`

const NON_COLOR_ARBITRARY_FIXTURE = `const h = <div className="min-h-[44px] max-h-[600px]" />
`

const HEX_NEW_FILE_FIXTURE = `const i = <div className="bg-[#fff]" />
`

const HEX_FORMERLY_BASELINED_FIXTURE = `const x = <div className="bg-[#fff]" />
`

describe('eslint config (programmatic fixture runner)', () => {
  it('reports 0 errors for a clean .tsx fixture', async () => {
    const results = await lintText(CLEAN_FIXTURE, '/home/esckode/projects/claude/rac8-4s/packages/frontend/src/fake-fixture.tsx')

    expect(results[0].errorCount).toBe(0)
  })

  it('reports >=1 error for a dirty fixture using eval', async () => {
    const results = await lintText(DIRTY_FIXTURE, '/home/esckode/projects/claude/rac8-4s/packages/frontend/src/fake-fixture-dirty.tsx')

    expect(results[0].errorCount).toBeGreaterThanOrEqual(1)
  })

  it('reports 0 no-undef errors for React.FC / JSX usage', async () => {
    const results = await lintText(REACT_FC_FIXTURE, '/home/esckode/projects/claude/rac8-4s/packages/frontend/src/fake-fixture-react-fc.tsx')

    const noUndefErrors = results[0].messages.filter((m) => m.ruleId === 'no-undef')
    expect(noUndefErrors).toHaveLength(0)
  })

  it('reports 0 no-undef errors for a NodeJS.Timeout type annotation', async () => {
    const results = await lintText(NODEJS_TIMEOUT_FIXTURE, '/home/esckode/projects/claude/rac8-4s/packages/frontend/src/fake-fixture-nodejs-timeout.ts')

    const noUndefErrors = results[0].messages.filter((m) => m.ruleId === 'no-undef')
    expect(noUndefErrors).toHaveLength(0)
  })

  it('reports a no-useless-escape error for an unnecessary escape character', async () => {
    const results = await lintText(USELESS_ESCAPE_FIXTURE, '/home/esckode/projects/claude/rac8-4s/packages/frontend/src/fake-fixture-useless-escape.ts')

    const errors = results[0].messages.filter((m) => m.ruleId === 'no-useless-escape')
    expect(errors.length).toBeGreaterThanOrEqual(1)
  })

  it('reports a no-useless-catch error for a try/catch that only rethrows', async () => {
    const results = await lintText(USELESS_CATCH_FIXTURE, '/home/esckode/projects/claude/rac8-4s/packages/frontend/src/fake-fixture-useless-catch.ts')

    const errors = results[0].messages.filter((m) => m.ruleId === 'no-useless-catch')
    expect(errors.length).toBeGreaterThanOrEqual(1)
  })

  it('reports a no-empty error for an empty catch block', async () => {
    const results = await lintText(EMPTY_BLOCK_FIXTURE, '/home/esckode/projects/claude/rac8-4s/packages/frontend/src/fake-fixture-empty-block.ts')

    const errors = results[0].messages.filter((m) => m.ruleId === 'no-empty')
    expect(errors.length).toBeGreaterThanOrEqual(1)
  })

  describe('no-restricted-syntax: color literals banned', () => {
    it('reports a no-restricted-syntax error for a hex color in className', async () => {
      const results = await lintText(HEX_CLASSNAME_FIXTURE, '/home/esckode/projects/claude/rac8-4s/packages/frontend/src/fake-fixture-hex-classname.tsx')

      const errors = results[0].messages.filter((m) => m.ruleId === 'no-restricted-syntax')
      expect(errors.length).toBeGreaterThanOrEqual(1)
    })

    it('reports a no-restricted-syntax error for a hex color in a style string', async () => {
      const results = await lintText(HEX_STYLE_STRING_FIXTURE, '/home/esckode/projects/claude/rac8-4s/packages/frontend/src/fake-fixture-hex-style.tsx')

      const errors = results[0].messages.filter((m) => m.ruleId === 'no-restricted-syntax')
      expect(errors.length).toBeGreaterThanOrEqual(1)
    })

    it('reports a no-restricted-syntax error for a 6-digit hex color in className', async () => {
      const results = await lintText(HEX_6_DIGIT_FIXTURE, '/home/esckode/projects/claude/rac8-4s/packages/frontend/src/fake-fixture-hex-6digit.tsx')

      const errors = results[0].messages.filter((m) => m.ruleId === 'no-restricted-syntax')
      expect(errors.length).toBeGreaterThanOrEqual(1)
    })

    it('reports a no-restricted-syntax error for rgba in a style string', async () => {
      const results = await lintText(RGBA_STYLE_FIXTURE, '/home/esckode/projects/claude/rac8-4s/packages/frontend/src/fake-fixture-rgba-style.tsx')

      const errors = results[0].messages.filter((m) => m.ruleId === 'no-restricted-syntax')
      expect(errors.length).toBeGreaterThanOrEqual(1)
    })

    it('reports a no-restricted-syntax error for an hsl string', async () => {
      const results = await lintText(HSL_STRING_FIXTURE, '/home/esckode/projects/claude/rac8-4s/packages/frontend/src/fake-fixture-hsl-string.ts')

      const errors = results[0].messages.filter((m) => m.ruleId === 'no-restricted-syntax')
      expect(errors.length).toBeGreaterThanOrEqual(1)
    })

    it('reports 0 no-restricted-syntax errors for a CSS var token in className', async () => {
      const results = await lintText(CSS_VAR_CLASSNAME_FIXTURE, '/home/esckode/projects/claude/rac8-4s/packages/frontend/src/fake-fixture-cssvar-classname.tsx')

      const errors = results[0].messages.filter((m) => m.ruleId === 'no-restricted-syntax')
      expect(errors).toHaveLength(0)
    })

    it('reports 0 no-restricted-syntax errors for a CSS var in a style string', async () => {
      const results = await lintText(CSS_VAR_STYLE_FIXTURE, '/home/esckode/projects/claude/rac8-4s/packages/frontend/src/fake-fixture-cssvar-style.tsx')

      const errors = results[0].messages.filter((m) => m.ruleId === 'no-restricted-syntax')
      expect(errors).toHaveLength(0)
    })

    it('reports 0 no-restricted-syntax errors for a non-color arbitrary value', async () => {
      const results = await lintText(NON_COLOR_ARBITRARY_FIXTURE, '/home/esckode/projects/claude/rac8-4s/packages/frontend/src/fake-fixture-noncolor-arbitrary.tsx')

      const errors = results[0].messages.filter((m) => m.ruleId === 'no-restricted-syntax')
      expect(errors).toHaveLength(0)
    })

    it('reports the color rule as an error (not a warning) on a new, non-legacy file', async () => {
      const results = await lintText(HEX_NEW_FILE_FIXTURE, '/home/esckode/projects/claude/rac8-4s/packages/frontend/src/components/NewComponent.tsx')

      expect(results[0].errorCount).toBeGreaterThanOrEqual(1)
    })

    it('reports the color rule as an error on a formerly-baselined path now that the interim baseline is torn down (E5.6)', async () => {
      const results = await lintText(HEX_FORMERLY_BASELINED_FIXTURE, '/home/esckode/projects/claude/rac8-4s/packages/frontend/src/pages/Login.tsx')

      expect(results[0].errorCount).toBeGreaterThanOrEqual(1)
    })
  })
})
