import { Router } from 'express'

const router = Router()

const dishes = [
  { id: 1, restaurantSlug: 'bella-roma', name: 'Margherita Pizza',    price: 18.00, rating: 4.7, reviews: 89,  available: true,  category: 'Pizza',    emoji: '🍕' },
  { id: 2, restaurantSlug: 'bella-roma', name: 'Spaghetti Carbonara', price: 22.00, rating: 4.9, reviews: 134, available: true,  category: 'Pasta',    emoji: '🍝' },
  { id: 3, restaurantSlug: 'bella-roma', name: 'Truffle Risotto',     price: 34.00, rating: 4.8, reviews: 56,  available: false, category: 'Mains',    emoji: '🍄' },
  { id: 4, restaurantSlug: 'bella-roma', name: 'Bistecca Fiorentina', price: 48.00, rating: 4.6, reviews: 41,  available: true,  category: 'Mains',    emoji: '🥩' },
  { id: 5, restaurantSlug: 'bella-roma', name: 'Caesar Salad',        price: 14.00, rating: 4.5, reviews: 72,  available: true,  category: 'Mains',    emoji: '🥗' },
  { id: 6, restaurantSlug: 'bella-roma', name: 'Tiramisu',            price: 12.00, rating: 4.9, reviews: 98,  available: true,  category: 'Desserts', emoji: '🍮' },

  { id: 7,  restaurantSlug: 'seda-ocagi', name: 'Lamb Piti',       price: 18.00, rating: 4.9, reviews: 210, available: true,  category: 'Mains',     emoji: '🥩' },
  { id: 8,  restaurantSlug: 'seda-ocagi', name: 'Dushbara',        price: 12.00, rating: 4.8, reviews: 145, available: true,  category: 'Soups',     emoji: '🍲' },
  { id: 9,  restaurantSlug: 'seda-ocagi', name: 'Shah Plov',       price: 24.00, rating: 4.9, reviews: 189, available: true,  category: 'Mains',     emoji: '🍚' },
  { id: 10, restaurantSlug: 'seda-ocagi', name: 'Qutab',           price: 8.00,  rating: 4.7, reviews: 92,  available: true,  category: 'Starters',  emoji: '🫓' },

  { id: 11, restaurantSlug: 'sakura-house', name: 'Salmon Nigiri',     price: 16.00, rating: 4.8, reviews: 76,  available: true,  category: 'Sushi',  emoji: '🍣' },
  { id: 12, restaurantSlug: 'sakura-house', name: 'Tonkotsu Ramen',    price: 22.00, rating: 4.9, reviews: 112, available: true,  category: 'Mains',  emoji: '🍜' },
  { id: 13, restaurantSlug: 'sakura-house', name: 'Dragon Roll',       price: 28.00, rating: 4.7, reviews: 88,  available: false, category: 'Rolls',  emoji: '🌯' },
  { id: 14, restaurantSlug: 'sakura-house', name: 'Mochi Ice Cream',   price: 10.00, rating: 4.6, reviews: 54,  available: true,  category: 'Desserts', emoji: '🍡' },
]

router.get('/', (req, res) => {
  const { restaurant, category } = req.query
  let result = dishes
  if (restaurant) result = result.filter(d => d.restaurantSlug === restaurant)
  if (category)   result = result.filter(d => d.category === category)
  res.json(result)
})

router.get('/:id', (req, res) => {
  const dish = dishes.find(d => d.id === parseInt(req.params.id))
  if (!dish) return res.status(404).json({ error: 'Dish not found' })
  res.json(dish)
})

router.patch('/:id/toggle', (req, res) => {
  const dish = dishes.find(d => d.id === parseInt(req.params.id))
  if (!dish) return res.status(404).json({ error: 'Dish not found' })
  dish.available = !dish.available
  res.json({ id: dish.id, available: dish.available })
})

export default router
