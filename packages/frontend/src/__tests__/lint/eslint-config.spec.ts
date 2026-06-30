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

describe('eslint config (programmatic fixture runner)', () => {
  it('reports 0 errors for a clean .tsx fixture', async () => {
    const results = await lintText(CLEAN_FIXTURE, '/home/esckode/projects/claude/rac8-4s/packages/frontend/src/fake-fixture.tsx')

    expect(results[0].errorCount).toBe(0)
  })

  it('reports >=1 error for a dirty fixture using eval', async () => {
    const results = await lintText(DIRTY_FIXTURE, '/home/esckode/projects/claude/rac8-4s/packages/frontend/src/fake-fixture-dirty.tsx')

    expect(results[0].errorCount).toBeGreaterThanOrEqual(1)
  })
})
