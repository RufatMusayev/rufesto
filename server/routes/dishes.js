import { Router } from 'express'
import { createClient } from '@supabase/supabase-js'
import ws from 'ws'

const router = Router()

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, {
  realtime: { transport: ws },
})

/* Service-role client again, so RLS (dishes are public-read anyway, but their
   parent restaurant may not be) isn't what protects this data — the explicit
   column list and the "restaurant must be active" join below are. */
const PUBLIC_DISH_COLUMNS = [
  'id', 'restaurant_id', 'menu_section_id', 'name', 'name_az', 'name_it',
  'description', 'description_az', 'price', 'photo', 'category', 'available',
  'is_vegan', 'is_vegetarian', 'is_gluten_free', 'is_spicy', 'spice_level',
  'prep_time_min', 'calories', 'sort_order', 'is_featured', 'avg_rating',
  'review_count', 'name_i18n', 'desc_i18n',
].join(', ')

const DISH_CATEGORIES = ['starter', 'soup', 'salad', 'main', 'side', 'dessert', 'beverage', 'alcoholic', 'kids']
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

router.get('/', async (req, res) => {
  const { restaurant, category } = req.query
  if (restaurant && typeof restaurant !== 'string') return res.status(400).json({ error: 'Invalid restaurant filter' })
  if (category && typeof category !== 'string') return res.status(400).json({ error: 'Invalid category filter' })
  if (category && !DISH_CATEGORIES.includes(category)) return res.status(400).json({ error: 'Invalid category filter' })

  let query = supabase
    .from('dishes')
    .select(`${PUBLIC_DISH_COLUMNS}, restaurants!inner(slug)`)
    .eq('restaurants.status', 'active')
  if (restaurant) query = query.eq('restaurants.slug', restaurant)
  if (category) query = query.eq('category', category)

  const { data, error } = await query
  if (error) {
    console.error('GET /api/dishes failed:', error)
    return res.status(500).json({ error: 'Failed to load dishes' })
  }
  res.json(data)
})

router.get('/:id', async (req, res) => {
  if (!UUID_RE.test(req.params.id)) return res.status(400).json({ error: 'Invalid dish id' })

  const { data, error } = await supabase
    .from('dishes')
    .select(`${PUBLIC_DISH_COLUMNS}, restaurants!inner(status)`)
    .eq('id', req.params.id)
    .eq('restaurants.status', 'active')
    .single()
  if (error) {
    const status = error.code === 'PGRST116' ? 404 : 500
    if (status === 500) console.error('GET /api/dishes/:id failed:', error)
    return res.status(status).json({ error: status === 404 ? 'Dish not found' : 'Failed to load dish' })
  }
  const { restaurants, ...dish } = data
  res.json(dish)
})

/* Dish availability is toggled by the dashboard through Supabase (RLS: managers only).
   The old PATCH /:id/toggle used the service key with no staff check and was removed. */

export default router
