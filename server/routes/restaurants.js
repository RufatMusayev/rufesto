import { Router } from 'express'
import { createClient } from '@supabase/supabase-js'
import ws from 'ws'

const router = Router()

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, {
  realtime: { transport: ws },
})

/* This route runs on the service-role client (bypasses RLS), so the safe-column
   list and the status filter below are the ONLY thing keeping owner_id, email,
   phone and non-active (inactive/suspended/pending_approval) restaurants private. */
const PUBLIC_RESTAURANT_COLUMNS = [
  'id', 'slug', 'name', 'address', 'city', 'country', 'cuisine_type',
  'cover_photo', 'logo', 'description', 'seating_capacity', 'website',
  'latitude', 'longitude',
].join(', ')

router.get('/', async (_req, res) => {
  const { data, error } = await supabase
    .from('restaurants')
    .select(PUBLIC_RESTAURANT_COLUMNS)
    .eq('status', 'active')
  if (error) {
    console.error('GET /api/restaurants failed:', error)
    return res.status(500).json({ error: 'Failed to load restaurants' })
  }
  res.json(data)
})

router.get('/:slug', async (req, res) => {
  const { data, error } = await supabase
    .from('restaurants')
    .select(PUBLIC_RESTAURANT_COLUMNS)
    .eq('status', 'active')
    .eq('slug', req.params.slug)
    .single()
  if (error) {
    const status = error.code === 'PGRST116' ? 404 : 500
    if (status === 500) console.error('GET /api/restaurants/:slug failed:', error)
    return res.status(status).json({ error: status === 404 ? 'Restaurant not found' : 'Failed to load restaurant' })
  }
  res.json(data)
})

export default router
