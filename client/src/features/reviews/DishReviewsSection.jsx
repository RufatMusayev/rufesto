import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import LoadError from '../../components/LoadError'
import { formatNumber } from '../../lib/helpers'
import CompactReview from './CompactReview'
import { getDishReviews } from './api'
import { ReviewSkeletons } from './ReviewSkeletons'
import './i18n'
import './reviews.css'

const DishReviewsSheet = lazy(() => import('./DishReviewsSheet'))

/**
 * The reviews block of the dish sheet (docs/UX-PLAN-2026-10-18.md 7.2): "Reviews ★4.6 · 12   Write ›", the top `preview`
 * rows (the viewer's own review first, then the most liked; real author names from the dish_reviews RPC), and
 * "See all 12 reviews ›" which opens the full list (Top | Newest, paged) over the dish sheet.
 *
 *   dishId        required
 *   onWrite       () => void: opens the "write a review" sheet; the "Write ›" link only shows when given
 *   refreshKey    change it after a review was posted: the block quietly reloads (the new review sorts first)
 *   onSummary     ({ avg: number | null, count: number }) => void, so the dish sheet's meta line can show ★avg (N)
 *   preview       rows shown before "See all" (default 3)
 * Sign-in for like / reply is handled by the rows themselves.
 */
export default function DishReviewsSection({ dishId, onWrite, refreshKey, onSummary, preview = 3 }) {
  const { t } = useTranslation('reviews')
  const [state, setState] = useState({ status: 'loading', items: [], summary: null })
  const [all, setAll] = useState(false)
  const seq = useRef(0)
  const report = useRef(onSummary)
  report.current = onSummary

  const load = useCallback(async () => {
    const mine = ++seq.current
    const { data, error } = await getDishReviews({ dishId, sort: 'top', limit: preview })
    if (mine !== seq.current) return
    if (error) { setState(s => (s.status === 'ready' ? s : { status: 'error', items: [], summary: null })); return }
    setState({ status: 'ready', items: data.items, summary: data.summary })
    report.current?.({ avg: data.summary.avg, count: data.summary.count })
  }, [dishId, preview])

  // a new dish starts from the skeleton; a bumped refreshKey keeps the rows on screen while it reloads
  useEffect(() => { setState({ status: 'loading', items: [], summary: null }) }, [dishId])
  useEffect(() => { load(); return () => { seq.current++ } }, [load, refreshKey])

  const count = state.summary?.count || 0
  const avg = state.summary?.avg
  const ready = state.status === 'ready'

  return (
    <section className="rv-section" aria-labelledby={`rv-sec-${dishId}`}>
      <header className="rv-sec-head">
        <h3 className="rv-sec-title" id={`rv-sec-${dishId}`}>
          {t('sectionTitle')}
          {ready && count > 0 && avg != null && (
            <span className="rv-sec-meta" aria-label={t('average', { avg: formatNumber(avg, 1), count })}>
              <span className="rv-sec-star" aria-hidden="true">★</span>{formatNumber(avg, 1)} · {count}
            </span>
          )}
        </h3>
        {onWrite && (
          <button type="button" className="rv-write" onClick={onWrite}>{t('write')} <span aria-hidden="true">›</span></button>
        )}
      </header>

      {state.status === 'loading' && <ReviewSkeletons count={2} />}
      {state.status === 'error' && <LoadError onRetry={load} />}
      {ready && state.items.length === 0 && (
        <div className="rv-empty"><strong>{t('empty')}</strong><span>{t('emptyHint')}</span></div>
      )}
      {ready && state.items.map(r => <CompactReview key={r.id} item={r} variant="row" where="none" />)}
      {ready && count > state.items.length && (
        <button type="button" className="rv-seeall" onClick={() => setAll(true)}>
          {t('seeAll', { count })} <span aria-hidden="true">›</span>
        </button>
      )}
      {all && <Suspense fallback={null}><DishReviewsSheet dishId={dishId} onClose={() => setAll(false)} /></Suspense>}
    </section>
  )
}
