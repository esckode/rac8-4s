import { AsyncLocalStorage } from 'node:async_hooks'

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export interface LogEntry {
  ts: string
  level: LogLevel
  module: string
  msg: string
  [key: string]: unknown
}

export type Transport = (entry: LogEntry) => void

export interface ModuleLogger {
  debug(msg: string, ctx?: Record<string, unknown>): void
  info(msg: string, ctx?: Record<string, unknown>): void
  warn(msg: string, ctx?: Record<string, unknown>): void
  error(msg: string, ctx?: Record<string, unknown>): void
}

const LEVEL_RANK: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
}

const baselineStr = process.env.LOG_LEVEL?.toLowerCase()
const baseline = baselineStr && baselineStr in LEVEL_RANK ? (baselineStr as LogLevel) : null
const baselineRank = baseline ? LEVEL_RANK[baseline] : null

const transports: Transport[] = []

const stdoutTransport: Transport = (entry) => {
  process.stdout.write(JSON.stringify(entry) + '\n')
}

if (baseline !== null) {
  transports.push(stdoutTransport)
}

const requestContext = new AsyncLocalStorage<{ requestId: string }>()

export function addTransport(fn: Transport): void {
  transports.push(fn)
}

export function runWithRequestId<T>(requestId: string, fn: () => T): T {
  return requestContext.run({ requestId }, fn)
}

export function getLogger(module: string): ModuleLogger {
  return {
    debug: (msg: string, ctx?: Record<string, unknown>) => emit('debug', module, msg, ctx),
    info: (msg: string, ctx?: Record<string, unknown>) => emit('info', module, msg, ctx),
    warn: (msg: string, ctx?: Record<string, unknown>) => emit('warn', module, msg, ctx),
    error: (msg: string, ctx?: Record<string, unknown>) => emit('error', module, msg, ctx),
  }
}

function emit(level: LogLevel, module: string, msg: string, ctx?: Record<string, unknown>): void {
  const envKey = `LOG_${module.toUpperCase().replace(/-/g, '_')}`
  const moduleOverride = process.env[envKey]?.toLowerCase()
  const effectiveStr = moduleOverride && moduleOverride in LEVEL_RANK ? (moduleOverride as LogLevel) : baseline
  const effectiveRank = effectiveStr ? LEVEL_RANK[effectiveStr] : null

  if (effectiveRank === null || transports.length === 0 || LEVEL_RANK[level] > effectiveRank) {
    return
  }

  const asyncCtx = requestContext.getStore()
  const entry: LogEntry = {
    ts: new Date().toISOString(),
    level,
    module,
    msg,
    ...(asyncCtx?.requestId ? { requestId: asyncCtx.requestId } : {}),
    ...ctx,
  }

  transports.forEach((t) => t(entry))
}
