import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import DishDetailSheet from '../DishDetailSheet'
import { useDishLink, takeSeed } from './dishLink'
import { fetchDish } from './dishApi'

/**
 * Shows the dish sheet for ?dish=<id> of the current URL. `resolve(id)` hands over a dish the page already has (the
 * restaurant page's menu); otherwise the opener's card is shown at once (a seed) and the full row is read by id.
 * The sheet stays mounted while it animates out and is dropped after (BottomSheet calls onClosed).
 */
export default function DishSheetHost({ resolve }) {
  const { i18n } = useTranslation()
  const lang = (i18n.resolvedLanguage || i18n.language || 'en').slice(0, 2)
  const { dishId, close } = useDishLink()
  const known = useMemo(() => (dishId ? resolve?.(dishId) || null : null), [dishId, resolve])
  const [fetched, setFetched] = useState(null)
  const [kept, setKept] = useState(null)
  const live = useRef({})

  useEffect(() => {
    if (!dishId || known) return undefined
    let alive = true
    fetchDish(dishId, lang).then(d => { if (alive && d) setFetched(d) })
    return () => { alive = false }
  }, [dishId, known, lang])

  const full = known || (fetched?.id === dishId ? fetched : null)
  const dish = dishId ? full || takeSeed(dishId) : null
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
