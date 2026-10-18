import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import DishDetailSheet from '../DishDetailSheet'
import { useDishLink, takeSeed } from './dishLink'
import { fetchDish } from './dishApi'
import { nameIn } from '../../lib/lang'

/**
 * Shows the dish sheet for ?dish=<id> of the current URL. `resolve(id)` hands over a dish the page already has (the
 * restaurant page's menu); otherwise the opener's card is shown at once (a seed: name, photo, price, venue) and the full
 * row is read by id and fills in the rest. The read starts the moment the host mounts, so it runs in parallel with the
 * page behind it. The sheet stays mounted while it animates out and is dropped after (BottomSheet calls onClosed).
 */
export default function DishSheetHost({ resolve }) {
  const { i18n } = useTranslation()
  const lang = (i18n.resolvedLanguage || i18n.language || 'en').slice(0, 2)
  const { dishId, close } = useDishLink()
  const known = useMemo(() => (dishId ? resolve?.(dishId) || null : null), [dishId, resolve])
  const [fetched, setFetched] = useState(null)
  const [gaveUp, setGaveUp] = useState(null)         // the id whose read failed: the seed is all there is
  const [kept, setKept] = useState(null)
  const live = useRef({})

  useEffect(() => {
    if (!dishId || known) return undefined
    let alive = true
    fetchDish(dishId, lang).then(d => {
      if (!alive) return
      if (d) setFetched(d)
      else setGaveUp(dishId)
    })
    return () => { alive = false }
  }, [dishId, known, lang])

  const full = known || (fetched?.id === dishId ? fetched : null)
  const seed = dishId && !full ? takeSeed(dishId) : null
  const dish = useMemo(() => {
    if (full) return full
    const s = seed && gaveUp === dishId ? { ...seed, seed: false } : seed
    return s ? { ...s, name: nameIn(s, lang) || s.name } : s          // a card's name in the app language (name_i18n) until the row arrives
  }, [full, seed, gaveUp, dishId, lang])
  live.current = { dishId }

  // keep the last dish through the exit animation; a newer dish replaces it
  useEffect(() => { if (dish) setKept(dish) }, [dish])

  const shown = dish || kept
  if (!shown) return null
  return (
    <DishDetailSheet
      key={shown.id}
      dish={shown}
      open={!!dishId && !!dish}
      onClose={close}
      onClosed={() => { if (!live.current.dishId) setKept(null) }}
    />
  )
}
