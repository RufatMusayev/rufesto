import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import LoadError from '../../components/LoadError'
import CompactReview from './CompactReview'
import { getDishReviews, getRestaurantReviews } from './api'
import { ReviewSkeletons } from './ReviewSkeletons'
import './i18n'
import './reviews.css'

const PAGE = 20

/**
 * The scrolling list inside a reviews sheet: a sticky Top | Newest switch, then compact rows. Top = one page of up to 30 (the
 * viewer's own review first, then the most liked); Newest pages by cursor. Give it `dishId` (dish sheet, row 2 hidden) or
 * `restaurantId` (restaurant page, row 2 shows only the dish). Rendered inside a BottomSheet body.
 */
export default function ReviewsList({ dishId = null, restaurantId = null }) {
  const { t } = useTranslation('reviews')
  const [sort, setSort] = useState('top')
  const [state, setState] = useState({ status: 'loading', items: [], next: null })
  const [more, setMore] = useState(false)
  const seq = useRef(0)

  const fetchPage = useCallback((s, cursor) => (dishId
    ? getDishReviews({ dishId, sort: s, cursor, limit: s === 'top' ? 30 : PAGE })
    : getRestaurantReviews({ restaurantId, sort: s, cursor, limit: s === 'top' ? 30 : PAGE })), [dishId, restaurantId])

  const load = useCallback(async () => {
    const mine = ++seq.current
    setState(s => ({ status: 'loading', items: s.items, next: null }))
    const { data, error } = await fetchPage(sort, null)
    if (mine !== seq.current) return
    setState(error ? { status: 'error', items: [], next: null } : { status: 'ready', items: data.items, next: data.nextCursor })
  }, [fetchPage, sort])

  useEffect(() => { load(); return () => { seq.current++ } }, [load])

  async function loadMore() {
    if (!state.next || more) return
    setMore(true)
    const { data } = await fetchPage(sort, state.next)
    setMore(false)
    if (!data) return
    setState(s => {
      const seen = new Set(s.items.map(x => x.id))
      return { ...s, items: [...s.items, ...data.items.filter(x => !seen.has(x.id))], next: data.nextCursor }
    })
  }

  return (
    <div className="rv-list">
      <div className="rv-sortbar" role="group" aria-label={t('sortLabel')}>
        {['top', 'new'].map(s => (
          <button
            key={s} type="button" className={`rv-sort${sort === s ? ' is-on' : ''}`} aria-pressed={sort === s}
            onClick={() => setSort(s)}
          >
            {t(s === 'top' ? 'sortTop' : 'sortNew')}
          </button>
        ))}
      </div>
      {state.status === 'loading' && state.items.length === 0 && <ReviewSkeletons count={4} />}
      {state.status === 'error' && <LoadError onRetry={load} />}
      {state.status === 'ready' && state.items.length === 0 && (
        <div className="rv-empty"><strong>{t('empty')}</strong><span>{t('emptyHint')}</span></div>
      )}
      {state.items.map(r => <CompactReview key={r.id} item={r} variant="row" where={dishId ? 'none' : 'dish'} />)}
      {state.next && (
        <button type="button" className="rv-more-btn" onClick={loadMore} disabled={more}>{t('loadMore')}</button>
      )}
    </div>
  )
}
