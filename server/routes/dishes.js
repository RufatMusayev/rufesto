import { Router } from 'express'
import { createClient } from '@supabase/supabase-js'

const router = Router()

/* ── Supabase client ─────── */
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)

/**
 * Auth middleware — verifies the Supabase JWT from the Authorization header.
 * Attaches `req.user` on success, returns 401 on failure.
 */
async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid authorization header' })
  }
  const token = authHeader.slice(7)
  const { data: { user }, error } = await supabase.auth.getUser(token)
  if (error || !user) {
    return res.status(401).json({ error: 'Invalid or expired token' })
  }
  req.user = user
  next()
}

router.get('/', async (req, res) => {
  const { restaurant, category } = req.query
  if (restaurant && typeof restaurant !== 'string') return res.status(400).json({ error: 'Invalid restaurant filter' })
  if (category && typeof category !== 'string') return res.status(400).json({ error: 'Invalid category filter' })
  let query = supabase.from('dishes').select('*, restaurants!inner(slug)')
  if (restaurant) query = query.eq('restaurants.slug', restaurant)
  if (category) query = query.eq('category', category)
  const { data, error } = await query
  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

router.get('/:id', async (req, res) => {
  const { data, error } = await supabase
    .from('dishes')
    .select('*')
    .eq('id', req.params.id)
    .single()
  if (error) {
    const status = error.code === 'PGRST116' ? 404 : 500
    return res.status(status).json({ error: status === 404 ? 'Dish not found' : error.message })
  }
  res.json(data)
})

/* Protected — only authenticated staff can toggle dish availability */
router.patch('/:id/toggle', requireAuth, async (req, res) => {
  const { data: dish, error: fetchError } = await supabase
    .from('dishes')
    .select('id, available')
    .eq('id', req.params.id)
    .single()
  if (fetchError || !dish) return res.status(404).json({ error: 'Dish not found' })

  const { data: updated, error: updateError } = await supabase
    .from('dishes')
    .update({ available: !dish.available })
    .eq('id', req.params.id)
    .select('id, available')
    .single()
  if (updateError) return res.status(500).json({ error: updateError.message })
  res.json(updated)
})

export default router
