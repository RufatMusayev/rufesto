import { Router } from 'express'

const router = Router()

const restaurants = [
  {
    id:      '10000000-0000-0000-0000-000000000001',
    slug:    'bella-roma',
    name:    'Trattoria Bella Roma',
    cuisine: 'Italian',
    address: 'Nizami Street 42, Baku',
    rating:  4.8,
    reviews: 312,
    open:    true,
    closes:  '23:00',
    emoji:   '🍝',
    tables:  6,
    activeDishes: 24,
  },
  {
    id:      '10000000-0000-0000-0000-000000000002',
    slug:    'seda-ocagi',
    name:    'Səda Ocağı',
    cuisine: 'Azerbaijani',
    address: 'İçərişəhər, Baku',
    rating:  4.9,
    reviews: 287,
    open:    true,
    closes:  '22:30',
    emoji:   '🫕',
    tables:  6,
    activeDishes: 18,
  },
  {
    id:      '10000000-0000-0000-0000-000000000003',
    slug:    'sakura-house',
    name:    'Sakura House',
    cuisine: 'Japanese',
    address: 'Tbilisi Avenue 8, Baku',
    rating:  4.7,
    reviews: 198,
    open:    true,
    closes:  '23:30',
    emoji:   '🍣',
    tables:  6,
    activeDishes: 22,
  },
]

router.get('/', (_req, res) => res.json(restaurants))

router.get('/:slug', (req, res) => {
  const r = restaurants.find(r => r.slug === req.params.slug)
  if (!r) return res.status(404).json({ error: 'Restaurant not found' })
  res.json(r)
})

export default router
