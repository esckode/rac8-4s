#!/usr/bin/env node
import { spawn } from 'child_process'
import http from 'http'
import { execSync } from 'child_process'
import { readFileSync } from 'fs'

const API_PORT = 3001
const FRONTEND_PORT = 5173
const POSTGRES_PORT = 5432

// Color output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  blue: '\x1b[34m',
}

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`)
}

async function checkPort(port, name) {
  return new Promise((resolve) => {
    const req = http.get(`http://localhost:${port}`, (res) => {
      resolve(true)
    })
    req.on('error', () => {
      resolve(false)
    })
    req.setTimeout(2000)
  })
}

function checkProcess(port) {
  try {
    const result = execSync(`lsof -i :${port} 2>/dev/null || true`, { encoding: 'utf8' })
    return result.includes('LISTEN')
  } catch {
    return false
  }
}

// The worker has no HTTP port to probe — it's a pure BullMQ consumer — so
// detect it by process name instead.
function checkWorkerProcess() {
  try {
    const result = execSync('pgrep -f "worker-entrypoint.ts" 2>/dev/null || true', { encoding: 'utf8' })
    return result.trim().length > 0
  } catch {
    return false
  }
}

// UAT ISSUE-34 / ISSUE-71: the e2e sweep self-DoSes on rate limiters that key
// on per-registration or per-partner-email addresses unless these overrides
// are set in the file the API server actually reads its env from
// (packages/api/.env, not the repo root). Reads the file directly rather
// than process.env, since this script doesn't load dotenv and the value
// only matters to the already-running API process.
//
// `critical: true` means a missing override actually self-DoSes the sweep
// (reads ❌). The other two are defence-in-depth on top of the real ISSUE-71
// fix (a unique partner email per spec) and register-per-email never firing
// at all (unique registrant emails) — missing reads ⚠️, not ❌.
const RATE_LIMIT_OVERRIDES = [
  {
    name: 'APP_LIMITS_RATE_LIMIT_REGISTER_PER_IP_MAX_ATTEMPTS',
    label: 'per-IP registration cap (ISSUE-34)',
    critical: true,
  },
  {
    name: 'APP_LIMITS_RATE_LIMIT_PARTNER_INVITE_PER_EMAIL_MAX_ATTEMPTS',
    label: 'per-partner-email doubles-invite cap (ISSUE-71)',
    critical: false,
  },
  {
    name: 'APP_LIMITS_RATE_LIMIT_REGISTER_PER_EMAIL_MAX_ATTEMPTS',
    label: 'per-registrant-email cap (precautionary — never fires)',
    critical: false,
  },
]

function checkRateLimitOverrides() {
  let contents = ''
  try {
    contents = readFileSync('packages/api/.env', 'utf8')
  } catch {
    contents = ''
  }
  return RATE_LIMIT_OVERRIDES.map((override) => {
    const match = contents.match(new RegExp(`^${override.name}=(\\d+)`, 'm'))
    if (!match) return { ...override, set: false, value: null }
    return { ...override, set: true, value: parseInt(match[1], 10) }
  })
}

async function startServer(workspaceName, port, displayName) {
  return new Promise((resolve, reject) => {
    log(`\n🚀 Starting ${displayName}...`, 'blue')

    const proc = spawn('npm', ['run', 'dev', `--workspace=packages/${workspaceName}`], {
      cwd: process.cwd(),
      stdio: 'inherit',
    })

    let resolved = false
    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true
        resolve(proc)
      }
    }, 15000) // Give server 15 seconds to start

    proc.on('error', (err) => {
      clearTimeout(timeout)
      if (!resolved) {
        resolved = true
        reject(err)
      }
    })

    proc.on('close', (code) => {
      clearTimeout(timeout)
      if (!resolved) {
        resolved = true
        if (code !== 0) {
          reject(new Error(`${displayName} exited with code ${code}`))
        }
      }
    })
  })
}

async function main() {
  log('\n📋 E2E Testing Setup', 'blue')
  log('═'.repeat(50), 'blue')

  // Check PostgreSQL
  log('\n1️⃣  Checking PostgreSQL...', 'blue')
  const pgRunning = checkProcess(POSTGRES_PORT)
  if (pgRunning) {
    log('✅ PostgreSQL is running on port 5432', 'green')
  } else {
    log('⚠️  PostgreSQL not detected on port 5432', 'yellow')
    log('   To start: docker compose up -d postgres', 'yellow')
  }

  // Check/start API server
  log('\n2️⃣  Checking API server on port 3001...', 'blue')
  let apiRunning = await checkPort(API_PORT, 'API')

  if (!apiRunning) {
    apiRunning = checkProcess(API_PORT)
  }

  if (apiRunning) {
    log('✅ API server is running', 'green')
  } else {
    log('❌ API server not running', 'red')
    const autoStart = process.argv.includes('--auto-start')

    if (autoStart) {
      try {
        log('   Starting API server...', 'yellow')
        await startServer('api', API_PORT, 'API server')
        // Wait a bit for server to be ready
        await new Promise(r => setTimeout(r, 3000))
        apiRunning = await checkPort(API_PORT, 'API')
        if (apiRunning) {
          log('✅ API server started successfully', 'green')
        }
      } catch (err) {
        log(`❌ Failed to start API server: ${err.message}`, 'red')
        log('   Run manually: npm run dev --workspace=packages/api', 'yellow')
      }
    } else {
      log('   Run manually: npm run dev --workspace=packages/api', 'yellow')
      log('   Or use: node scripts/e2e-setup.js --auto-start', 'yellow')
    }
  }

  // Check/start frontend server
  log('\n3️⃣  Checking frontend dev server on port 5173...', 'blue')
  let frontendRunning = await checkPort(FRONTEND_PORT, 'Frontend')

  if (!frontendRunning) {
    frontendRunning = checkProcess(FRONTEND_PORT)
  }

  if (frontendRunning) {
    log('✅ Frontend dev server is running', 'green')
  } else {
    log('❌ Frontend dev server not running', 'red')
    const autoStart = process.argv.includes('--auto-start')

    if (autoStart) {
      try {
        log('   Starting frontend dev server...', 'yellow')
        await startServer('frontend', FRONTEND_PORT, 'Frontend dev server')
        // Wait a bit for server to be ready
        await new Promise(r => setTimeout(r, 5000))
        frontendRunning = await checkPort(FRONTEND_PORT, 'Frontend')
        if (frontendRunning) {
          log('✅ Frontend dev server started successfully', 'green')
        }
      } catch (err) {
        log(`❌ Failed to start frontend server: ${err.message}`, 'red')
        log('   Run manually: npm run dev --workspace=packages/frontend', 'yellow')
      }
    } else {
      log('   Run manually: npm run dev --workspace=packages/frontend', 'yellow')
      log('   Or use: node scripts/e2e-setup.js --auto-start', 'yellow')
    }
  }

  // Check/start the background worker (assistant/coach replies, nudge/recap/digest
  // sweeps, and doubles group-creation's teams.formed notifications — anything
  // JOB_QUEUE=bullmq routes through a queue consumer instead of an inline
  // in-process call). Silently missing, these specs fail with confusing errors
  // ("Custom Id cannot contain :", "not wired (JOB_QUEUE=bullmq mode?)", or an
  // assistant reply / team-formed notification that never appears) rather than
  // an obvious "not running" (ISSUE-19).
  log('\n4️⃣  Checking background worker (assistant/coach, nudge/recap/digest, teams.formed)...', 'blue')
  let workerRunning = checkWorkerProcess()

  if (workerRunning) {
    log('✅ Worker is running', 'green')
  } else {
    log('❌ Worker not running', 'red')
    const autoStart = process.argv.includes('--auto-start')

    if (autoStart) {
      try {
        log('   Starting worker...', 'yellow')
        const proc = spawn('npm', ['run', 'dev:worker', '--workspace=packages/api'], {
          cwd: process.cwd(),
          stdio: 'inherit',
        })
        proc.unref()
        await new Promise(r => setTimeout(r, 5000))
        workerRunning = checkWorkerProcess()
        if (workerRunning) {
          log('✅ Worker started successfully', 'green')
        }
      } catch (err) {
        log(`❌ Failed to start worker: ${err.message}`, 'red')
        log('   Run manually: npm run dev:worker --workspace=packages/api', 'yellow')
      }
    } else {
      log('   Only needed if JOB_QUEUE=bullmq (this repo\'s dev/e2e default) and you\'re', 'yellow')
      log('   running assistant/coach/nudge/recap/digest specs, or a doubles spec that', 'yellow')
      log('   creates groups (partner-requests.spec.ts, group-stage-doubles.spec.ts).', 'yellow')
      log('   Run manually: npm run dev:worker --workspace=packages/api', 'yellow')
      log('   Or use: node scripts/e2e-setup.js --auto-start', 'yellow')
    }
  }

  // Check the e2e rate-limit overrides (UAT ISSUE-34, ISSUE-71)
  log('\n5️⃣  Checking e2e registration rate-limit overrides...', 'blue')
  const rateLimitOverrides = checkRateLimitOverrides()
  for (const override of rateLimitOverrides) {
    if (override.set && override.value >= 1000) {
      log(`✅ ${override.name}=${override.value} — ${override.label}`, 'green')
    } else if (override.set) {
      log(`⚠️  ${override.name} set but low (${override.value}) — ${override.label} may still hit RATE_LIMITED`, 'yellow')
    } else if (override.critical) {
      log(`❌ ${override.name} not set in packages/api/.env — the e2e sweep will self-DoS on its own`, 'red')
      log(`   fixtures (${override.label}). Add:`, 'red')
      log(`   ${override.name}=10000`, 'red')
    } else {
      log(`⚠️  ${override.name} not set in packages/api/.env — ${override.label}. Add:`, 'yellow')
      log(`   ${override.name}=10000`, 'yellow')
    }
  }
  if (apiRunning) {
    log('   ⚠️  API server was already running — restart it if you just added this,', 'yellow')
    log('      it only reads env vars at boot.', 'yellow')
  }

  // Validate browser
  log('\n6️⃣  Validating frontend with persistent browser...', 'blue')
  if (frontendRunning) {
    try {
      const result = execSync('node scripts/browser.js', { encoding: 'utf8', stdio: 'inherit' })
      log('✅ Browser validation successful', 'green')
    } catch (err) {
      log('⚠️  Browser validation had issues', 'yellow')
    }
  } else {
    log('⏭️  Skipping browser validation (frontend server not ready)', 'yellow')
  }

  // Summary
  log('\n' + '═'.repeat(50), 'blue')
  log('📊 Setup Summary:', 'blue')
  log(`  PostgreSQL: ${pgRunning ? '✅' : '❌'}`, 'blue')
  log(`  API Server (3001): ${apiRunning ? '✅' : '❌'}`, 'blue')
  log(`  Frontend Server (5173): ${frontendRunning ? '✅' : '❌'}`, 'blue')
  log(`  Worker: ${workerRunning ? '✅' : '❌ (only needed for assistant/coach/sweep/doubles-groups specs)'}`, 'blue')
  for (const override of rateLimitOverrides) {
    const ok = override.set && override.value >= 1000
    const status = ok ? '✅' : override.critical ? '❌ (full test:e2e sweep will hit RATE_LIMITED)' : '⚠️  (defence-in-depth only)'
    log(`  Rate-limit override — ${override.label}: ${status}`, 'blue')
  }

  if (apiRunning && frontendRunning) {
    log('\n✅ Core prerequisites met! Ready to run E2E tests.', 'green')
    if (!workerRunning) {
      log('⚠️  Worker not running — assistant/coach/nudge/recap/digest specs and doubles', 'yellow')
      log('   group-creation specs (teams.formed notifications) will fail.', 'yellow')
    }
    log('\nNext steps:', 'green')
    log('  npm run test:e2e              # Headless mode', 'green')
    log('  npm run test:e2e:ui           # Interactive UI mode', 'green')
    log('  npm run test:e2e:debug        # Debug mode', 'green')
  } else {
    log('\n⚠️  Some prerequisites are missing.', 'yellow')
    log('    Start servers before running tests.', 'yellow')
  }

  log('', 'reset')
}

main().catch(err => {
  log(`\n❌ Error: ${err.message}`, 'red')
  process.exit(1)
})
