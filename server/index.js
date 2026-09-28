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

/* ── Trust proxy ──────────────────────────────────────────
   Request path: browser → Cloudflare edge → cloudflared (host) → nginx
   container (adds X-Forwarded-For via $proxy_add_x_forwarded_for) → this
   api container (expose-only, never reachable directly from the host).
   Cloudflare's edge appends the real client IP to X-Forwarded-For and
   cloudflared passes the header through. nginx then appends $remote_addr,
   which is cloudflared's address as nginx sees it (the Docker gateway on
   the published 127.0.0.1 port), and Express's own peer is nginx. So the
   chain Express walks from the right is: nginx (socket) → cloudflared/
   gateway (last XFF entry) → real client. `trust proxy = 2` skips exactly
   those two hops we run, making req.ip (and the rate limiter's bucket) the
   visitor. With 1, req.ip would be the gateway address shared by everyone.
   `true` would be unsafe: it would trust client-supplied entries to the
   left of what Cloudflare appended. */
app.set('trust proxy', 2)

/* ── Security headers ─────────────────────────────────── */
app.use(helmet())

/* ── CORS ─────────────────────────────────────────────── */
const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:5173')
  .split(',')
  .map(o => o.trim())

app.use(cors({
  origin(origin, cb) {
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true)
    const err = new Error('CORS: origin not allowed')
    err.status = 403
    cb(err)
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

/* ── Body parser ──────────────────────────────────────── */
app.use(express.json({ limit: '1mb' }))

/* ── Routes ───────────────────────────────────────────── */
app.use('/api/restaurants', publicLimiter, restaurantsRouter)
app.use('/api/dishes',      publicLimiter, dishesRouter)

app.get('/api/health', (_req, res) => res.json({ status: 'ok', ts: new Date().toISOString() }))

/* ── Error handler ────────────────────────────────────── */
app.use((err, _req, res, _next) => {
  if (err.status === 403) {
    return res.status(403).json({ error: 'Origin not allowed' })
  }
  console.error(err.stack || err)
  res.status(500).json({ error: 'Internal server error' })
})

app.listen(PORT, () => console.log(`Rufesto API running on http://localhost:${PORT}`))
