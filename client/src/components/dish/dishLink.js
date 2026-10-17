// The dish sheet is URL-driven (UX plan 7.3): opening pushes ?dish=<id> on the current page (restaurant page, Search),
// closing pops it. Back therefore closes the sheet, and a shared link /restaurant/<slug>?tab=menu&dish=<id> opens it.
// A dish opened from a card can hand the card over as a "seed": the sheet shows it at once while the full row loads.
import { useCallback } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

const seeds = new Map()                          // dish id -> the dish as the opener knew it
export const takeSeed = id => (id ? seeds.get(id) || null : null)

/** A Search / Discover dish card (view-model) as the keys the dish sheet reads. */
export function cardToDish(card) {
  const place = card.restaurant || {}
  return {
    id: card.id,
    name: card.name,
    description: null,
    photo: card.photo,
    price: card.price,
    category: card.category,
    available: card.available,
    avg_rating: card.rating,
    review_count: card.reviewCount,
    is_vegan: card.isVegan,
    is_vegetarian: card.isVegetarian,
    is_gluten_free: card.isGlutenFree,
    is_spicy: card.isSpicy,
    restaurant_id: place.id || null,
    restaurants: { name: place.name || '', slug: place.slug || '' },
    seed: true,                                  // the sheet knows more is coming (description, kcal, ...)
  }
}

/** { dishId, open(dish | card | id), close() } for the page the sheet sits on. */
export function useDishLink() {
  const navigate = useNavigate()
  const location = useLocation()
  const dishId = new URLSearchParams(location.search).get('dish')

  const open = useCallback(arg => {
    const obj = arg && typeof arg === 'object' ? arg : null
    const id = obj ? obj.id : arg
    if (!id) return
    if (obj) seeds.set(id, obj.restaurant !== undefined ? cardToDish(obj) : obj)
    const sp = new URLSearchParams(location.search)
    sp.set('dish', id)
    navigate(
      { pathname: location.pathname, search: `?${sp}`, hash: location.hash },
      { state: { ...(location.state || {}), dishPushed: true } },
    )
  }, [navigate, location.pathname, location.search, location.hash, location.state])

  const close = useCallback(() => {
    if (location.state?.dishPushed) { navigate(-1); return }
    const sp = new URLSearchParams(location.search)
    sp.delete('dish')
    const search = sp.toString()
    navigate({ pathname: location.pathname, search: search ? `?${search}` : '', hash: location.hash }, { replace: true, state: location.state })
  }, [navigate, location.pathname, location.search, location.hash, location.state])

  return { dishId, open, close }
}
