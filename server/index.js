import express from 'express'
import cors    from 'cors'
import restaurantsRouter from './routes/restaurants.js'
import dishesRouter      from './routes/dishes.js'

const app  = express()
const PORT = process.env.PORT || 3001

const corsOrigin = process.env.CORS_ORIGIN || 'http://localhost:5173'
app.use(cors({ origin: corsOrigin.split(',') }))
app.use(express.json())

app.use('/api/restaurants', restaurantsRouter)
app.use('/api/dishes',      dishesRouter)

app.get('/api/health', (_req, res) => res.json({ status: 'ok', ts: new Date().toISOString() }))

app.listen(PORT, () => console.log(`DineBaku API running on http://localhost:${PORT}`))
