import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import rateLimit from 'express-rate-limit'
import { timingSafeEqual } from 'node:crypto'
import { pushVisit } from './bark.js'
import { checkDatabase, initDatabase } from './db/client.js'
import { lookupGeo } from './services/geo.js'
import { isBot } from './services/bot.js'
import { readVisitor } from './services/visitor.js'
import { getVisitStats } from './services/visitStats.js'
import { saveVisit } from './services/visits.js'
import { peekVisit, rememberVisit, startVisitLimiterCleanup } from './visitLimiter.js'

const app = express()
const PORT = Number(process.env.PORT) || 3002
const PUSH_WINDOW_MS = Number(process.env.VISIT_PUSH_WINDOW_MS) || 60 * 60 * 1000

app.set('trust proxy', 1)
app.use(express.json({ limit: '16kb' }))

const origins = (process.env.CORS_ORIGIN || '')
  .split(',')
  .map((item) => item.trim())
  .filter(Boolean)

app.use(cors({
  origin: origins.length ? origins : true,
  allowedHeaders: ['Content-Type', 'X-Stats-Password'],
}))

const burstLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: 'RATE_LIMIT', message: '请求过于频繁，请稍后重试' },
})

async function handleVisit(req, res) {
  const visitor = readVisitor(req)
  const decision = peekVisit(visitor.ip, PUSH_WINDOW_MS)
  let geo = { status: 'error', address: '', message: 'lookup skipped' }

  try {
    geo = await lookupGeo(visitor.ip)
  } catch (err) {
    console.error('Geo lookup failed:', err.message)
    geo = { status: 'error', address: '', message: err.message }
  }

  let pushed = false
  let pushError = null
  const bot = isBot(visitor)
  if (decision.allowed && !bot) {
    try {
      await pushVisit({ visitor, geo })
      rememberVisit(visitor.ip)
      pushed = true
    } catch (err) {
      console.error('Bark push failed:', err.message)
      pushError = err
    }
  }

  let saved = false
  try {
    saved = await saveVisit({ visitor, geo, pushed })
  } catch (err) {
    console.error('Failed to save visit:', err.message)
  }

  if (pushError) {
    return res.status(502).json({ ok: false, pushed: false, saved, error: 'PUSH_FAILED' })
  }

  if (!decision.allowed) {
    res.set('Retry-After', String(decision.retryAfter))
  }

  return res.json({
    ok: true,
    pushed,
    saved,
    ...(decision.allowed ? {} : { retryAfter: decision.retryAfter }),
  })
}

app.get('/health', async (_req, res) => {
  res.json({ status: 'ok', database: await checkDatabase() })
})

const statsLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: 'RATE_LIMIT', message: '请求过于频繁，请稍后重试' },
})

function statsPasswordOk(req) {
  const expected = Buffer.from(process.env.STATS_PASSWORD || '')
  const actual = Buffer.from(String(req.get('x-stats-password') || ''))
  if (!expected.length || expected.length !== actual.length) return false
  return timingSafeEqual(expected, actual)
}

app.get('/api/stats', statsLimiter, async (req, res) => {
  if (!statsPasswordOk(req)) {
    return res.status(401).json({ ok: false, error: 'UNAUTHORIZED', message: '密码不正确' })
  }

  try {
    const stats = await getVisitStats()
    if (!stats) {
      return res.status(503).json({ ok: false, error: 'DATABASE_DISABLED', message: '数据库未配置' })
    }
    return res.json({ ok: true, ...stats })
  } catch (err) {
    console.error('Failed to load visit stats:', err.message)
    return res.status(500).json({ ok: false, error: 'STATS_FAILED', message: '统计读取失败' })
  }
})

app.get('/api/visit', burstLimiter, handleVisit)
app.post('/api/visit', burstLimiter, handleVisit)

app.use((err, _req, res, _next) => {
  console.error(err)
  res.status(500).json({ ok: false, error: 'INTERNAL_ERROR', message: '服务器内部错误' })
})

startVisitLimiterCleanup(PUSH_WINDOW_MS)

async function start() {
  try {
    const ready = await initDatabase()
    if (ready) console.log('MongoDB connected')
  } catch (err) {
    console.error('MongoDB init failed:', err.message)
  }

  app.listen(PORT, () => {
    console.log(`Portfolio API running on http://localhost:${PORT}`)
  })
}

start()
