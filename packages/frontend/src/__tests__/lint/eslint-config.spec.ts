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
})
