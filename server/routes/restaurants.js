import { Router } from 'express'
import { createClient } from '@supabase/supabase-js'
import ws from 'ws'

const router = Router()

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, {
  realtime: { transport: ws },
})

router.get('/', async (_req, res) => {
  const { data, error } = await supabase
    .from('restaurants')
    .select('*')
  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

router.get('/:slug', async (req, res) => {
  const { data, error } = await supabase
    .from('restaurants')
    .select('*')
    .eq('slug', req.params.slug)
    .single()
  if (error) {
    const status = error.code === 'PGRST116' ? 404 : 500
    return res.status(status).json({ error: status === 404 ? 'Restaurant not found' : error.message })
  }
  res.json(data)
})

export default router
