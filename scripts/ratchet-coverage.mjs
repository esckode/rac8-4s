#!/usr/bin/env node
/**
 * Coverage ratchet — see CLAUDE.md §13.
 *
 * Floors in packages/*\/jest.config.js are measured actuals, not aspirations.
 * This raises them to today's numbers so future regressions are caught.
 *
 *   node scripts/ratchet-coverage.mjs           # dry run, prints proposed raises
 *   node scripts/ratchet-coverage.mjs --write   # applies them
 *
 * How it gets the numbers: it re-runs each workspace's suite with every threshold
 * forced to 100 and parses Jest's own "not met: X%" messages. That is deliberate —
 * a path-specific threshold key REMOVES its files from the `global` pool, so the
 * totals in coverage-summary.json do not match what `global` is actually checked
 * against. Letting Jest report its own arithmetic is the only reliable source.
 */
import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import path, { resolve, dirname, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
// `shared` is deliberately absent: it is type declarations with no tests, so Jest
// reports no threshold misses and the ratchet would read that as "100% covered" and
// propose raising a floor that measures nothing. Add it back if it gains real tests.
const WORKSPACES = ['packages/core-logic', 'packages/api', 'packages/worker', 'packages/frontend']
const METRICS = ['branches', 'functions', 'lines', 'statements']
const WRITE = process.argv.includes('--write')

/**
 * Coverage in this repo is not perfectly deterministic — repeat runs of an unchanged
 * tree have been observed to differ (see the sync-queue.ts note in the frontend
 * config). Floor the measurement and back off a point, so a lucky run can't set a
 * floor that an ordinary run then fails. This is insurance against small jitter, NOT
 * a substitute for fixing a genuinely flaky test — if a metric swings by more than a
 * point, fix the test rather than widening this.
 */
const MARGIN = 1

const require = createRequire(import.meta.url)
const NOT_MET = /Jest: "(.+?)" coverage threshold for (\w+) \(100%\) not met: ([\d.]+)%/g

/** Run one workspace with all thresholds pinned to 100; return {key: {metric: actual}}. */
function measure(ws) {
  const cwd = resolve(ROOT, ws)
  const current = require(resolve(cwd, 'jest.config.js')).coverageThreshold ?? {}
  const pinned = Object.fromEntries(
    Object.keys(current).map((k) => [k, Object.fromEntries(METRICS.map((m) => [m, 100]))]),
  )

  let output = ''
  try {
    output = execFileSync(
      'npx',
      ['jest', '--coverage', '--silent', '--coverageReporters=text-summary',
       `--coverageThreshold=${JSON.stringify(pinned)}`],
      { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 },
    )
  } catch (err) {
    // Expected: pinning to 100 makes Jest exit 1. A missing stderr means it died
    // for some other reason (compile error, no DB) and the numbers can't be trusted.
    output = `${err.stdout ?? ''}${err.stderr ?? ''}`
    if (!NOT_MET.test(output)) {
      throw new Error(`${ws}: suite did not run to completion — refusing to ratchet.\n${output.slice(-800)}`)
    }
    NOT_MET.lastIndex = 0
  }

  // A red suite is not a baseline: failing tests leave paths unexercised, so its
  // numbers are both wrong and unstable. Refuse rather than bake them in.
  if (/Tests:.*\d+ failed/.test(output)) {
    const [, summary = ''] = output.match(/(Tests:.*)/) ?? []
    console.log(`${ws}: SKIPPED — suite is red, refusing to ratchet (${summary.trim()})`)
    return null
  }

  // Anything Jest did NOT complain about is genuinely at 100%.
  const actuals = Object.fromEntries(
    Object.keys(current).map((k) => [k, Object.fromEntries(METRICS.map((m) => [m, 100]))]),
  )

  for (const [, reported, metric, value] of output.matchAll(NOT_MET)) {
    const actual = Number.parseFloat(value)
    // Jest reports `global` under its own name, but a *glob* threshold key is applied
    // to each matching file separately and reported by absolute file path. So map the
    // path back to the key that matched it, and keep the worst file — every file has
    // to clear the threshold, so the floor is the minimum, not the average.
    const key = reported === 'global' ? 'global' : matchKey(reported, Object.keys(current), cwd)
    if (!key) continue
    actuals[key][metric] = Math.min(actuals[key][metric], actual)
  }
  return { current, actuals }
}

/** Find which threshold key (glob or directory prefix) a reported file path belongs to. */
function matchKey(reportedPath, keys, cwd) {
  const rel = `./${relative(cwd, reportedPath)}`
  for (const key of keys) {
    if (key === 'global') continue
    if (rel === key || path.matchesGlob(rel, key)) return key
    // Directory-style keys have no glob characters and match by prefix.
    if (!/[*?{[]/.test(key) && rel.startsWith(key.endsWith('/') ? key : `${key}/`)) return key
  }
  return null
}

/** Replace the coverageThreshold block in source text via brace matching. */
function rewrite(source, block) {
  const anchor = source.indexOf('coverageThreshold:')
  if (anchor === -1) throw new Error('no coverageThreshold block found')
  let i = source.indexOf('{', anchor)
  let depth = 0
  for (let j = i; j < source.length; j++) {
    if (source[j] === '{') depth++
    else if (source[j] === '}') {
      depth--
      if (depth === 0) return source.slice(0, i) + block + source.slice(j + 1)
    }
  }
  throw new Error('unbalanced braces in coverageThreshold block')
}

function render(next) {
  const body = Object.entries(next)
    .map(([key, metrics]) => {
      const inner = METRICS.map((m) => `      ${m}: ${metrics[m]},`).join('\n')
      const label = key === 'global' ? 'global' : `'${key}'`
      return `    ${label}: {\n${inner}\n    },`
    })
    .join('\n')
  return `{\n${body}\n  }`
}

let raised = 0
let skipped = 0
for (const ws of WORKSPACES) {
  const result = measure(ws)
  if (result === null) {
    skipped++
    continue
  }
  const { current, actuals } = result
  const next = {}
  const changes = []

  for (const [key, metrics] of Object.entries(current)) {
    next[key] = {}
    for (const m of METRICS) {
      const now = metrics[m] ?? 0
      const floor = Math.max(0, Math.floor(actuals[key][m]) - MARGIN)
      next[key][m] = Math.max(now, floor)
      if (floor > now) changes.push(`    ${key} ${m}: ${now} → ${floor}`)
    }
  }

  if (!changes.length) {
    console.log(`${ws}: no raise available`)
    continue
  }
  raised += changes.length
  console.log(`${ws}:\n${changes.join('\n')}`)

  if (WRITE) {
    const file = resolve(ROOT, ws, 'jest.config.js')
    writeFileSync(file, rewrite(readFileSync(file, 'utf8'), render(next)))
    console.log(`    written`)
  }
}

if (raised && !WRITE) {
  console.log(`\n${raised} threshold(s) can be raised. Re-run with --write to apply.`)
  console.log('Review them first: a single run cannot tell a genuine coverage gain from')
  console.log('a flaky metric landing on its lucky side. See CLAUDE.md §13.')
}
if (skipped) console.log(`\n${skipped} workspace(s) skipped — fix the failing tests, then re-run.`)
process.exit(0)
