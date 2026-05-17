import express   from 'express'
import cors      from 'cors'
import helmet    from 'helmet'
import rateLimit from 'express-rate-limit'
import restaurantsRouter from './routes/restaurants.js'
import dishesRouter      from './routes/dishes.js'

const requiredEnv = ['SUPABASE_URL', 'SUPABASE_SERVICE_KEY']
for (const key of requiredEnv) {
  if (!process.env[key]) {
    console.error(`Missing required env var: ${key}`)
    process.exit(1)
  }
}

const app  = express()
const PORT = process.env.PORT || 3001

/* ── Security headers ─────────────────────────────────── */
app.use(helmet())

/* ── CORS ─────────────────────────────────────────────── */
const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:5173')
  .split(',')
  .map(o => o.trim())

app.use(cors({
  origin(origin, cb) {
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true)
    cb(new Error('CORS: origin not allowed'))
  },
  credentials: true,
  methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
}))

/* ── Rate limiting ────────────────────────────────────── */
const publicLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
})

const protectedLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
})

/* ── Body parser ──────────────────────────────────────── */
app.use(express.json({ limit: '1mb' }))

/* ── Routes ───────────────────────────────────────────── */
app.use('/api/restaurants', publicLimiter, restaurantsRouter)
app.use('/api/dishes',      publicLimiter, dishesRouter)

app.get('/api/health', (_req, res) => res.json({ status: 'ok', ts: new Date().toISOString() }))

/* ── Error handler ────────────────────────────────────── */
app.use((err, _req, res, _next) => {
  console.error(err.stack || err)
  res.status(500).json({ error: 'Internal server error' })
})

app.listen(PORT, () => console.log(`Rufesto API running on http://localhost:${PORT}`))
