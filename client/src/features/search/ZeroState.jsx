import { memo, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import '../discover/styles.css'
import RestaurantRail from '../discover/components/RestaurantRail'
import CuisineChips from '../discover/components/CuisineChips'
import Section from '../discover/components/Section'
import DiscoverSkeleton from '../discover/components/DiscoverSkeleton'
import { cuisineLabel } from '../discover/cuisine'
import { PinIcon } from '../feed/components/LocationPill'
import CompactReview from '../reviews/CompactReview'
import PlaceRow from './rows/PlaceRow'
import DishRow from './rows/DishRow'
import { fold } from './fold'
import { nameIn, langOf } from '../../lib/lang'

/** Nearest first (places without a distance last, server order kept among equals). Only when the location is on. */
export const byDistance = places => places
  .map((p, i) => [p, i])
  .sort(([a, i], [b, j]) => (a.km ?? Infinity) - (b.km ?? Infinity) || i - j)
  .map(([p]) => p)

const FIRST_PLACES = 12            // rows rendered at once; "Show more" adds the same again (keeps the DOM small)
const TRENDING_SHOWN = 5
const REVIEWS_SHOWN = 3

/** Popular chips: the first 6 trending dish names plus the 2 biggest cuisines (a cuisine chip turns the Cuisine filter on). */
export function popularChips(data, chips, ts, lang) {
  if (!data) return []
  const seen = new Set()
  const dishes = data.trendingDishes
    .filter(d => d.name && !seen.has(fold(d.name)) && seen.add(fold(d.name)))
    .slice(0, 6)
    .map(d => {
      const label = nameIn(d, lang) || d.name
      // search() matches a Cyrillic query against the Russian names (sql/69e): the chip searches what it says; az / en keep the base name
      return { id: `d-${d.id}`, label, query: langOf(lang) === 'ru' ? label : d.name }
    })
  const cuisines = chips.slice(0, 2).map(c => ({ id: `c-${c.key}`, label: cuisineLabel(ts, c.key), cuisine: c.key }))
  return [...dishes, ...cuisines]
}

export const PopularChips = memo(function PopularChips({ items, onQuery, onCuisine }) {
  const { t } = useTranslation('search')
  if (!items.length) return null
  return (
    <section className="dsc-sec" aria-label={t('popular')}>
      <div className="dsc-head"><h2 className="dsc-h">{t('popular')}</h2></div>
      <div className="sr-pop">
        {items.map(c => (
          <button key={c.id} type="button" className="chip sr-pop-chip" onClick={() => (c.cuisine ? onCuisine(c.cuisine) : onQuery(c.query))}>
            {c.label}
          </button>
        ))}
      </div>
    </section>
  )
})

function RecentList({ recent, onPick, onRemove, onClear }) {
  const { t } = useTranslation('search')
  if (!recent.length) return null
  return (
    <section className="dsc-sec sr-recent" aria-label={t('recent')}>
      <div className="dsc-head">
        <h2 className="dsc-h">{t('recent')}</h2>
        <button type="button" className="sr-link-quiet" onClick={onClear}>{t('clear')}</button>
      </div>
      <ul className="sr-recent-list">
        {recent.slice(0, 5).map(q => (
          <li key={q} className="sr-recent-row">
            <button type="button" className="sr-recent-main" onClick={() => onPick(q)}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M3 12a9 9 0 1 0 3-6.7" /><path d="M3 4v5h5" /><path d="M12 8v4l3 2" />
              </svg>
              <span>{q}</span>
            </button>
            <button type="button" className="sr-recent-x" aria-label={t('removeRecent', { q })} onClick={() => onRemove(q)}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}

/**
 * The Search zero state (UX plan 3.2): the Discover content, decluttered. Recent, Popular, Cuisines, Open now (near
 * you), Trending dishes, Top reviews, All places. One discover() answer fills it (kept in discoverStore, so it paints
 * from memory when it is cached). A section with nothing to show is hidden.
 */
export default function ZeroState({
  data, status, onRetry, chips, geo, filterCuisine, recent, onRecent, onRemoveRecent, onClearRecent,
  onQuery, onCuisine, onSeeAllOpen, onOpenPlace, onOpenDish,
}) {
  const { t } = useTranslation('search')
  const { t: ts, i18n } = useTranslation('social')
  const [shown, setShown] = useState(FIRST_PLACES)
  const popular = useMemo(() => popularChips(data, chips, ts, i18n.language), [data, chips, ts, i18n.language])
  const allPlaces = useMemo(() => {
    const list = data?.allRestaurants || []
    return geo.status === 'on' && list.some(p => p.km != null) ? byDistance(list) : list
  }, [data, geo.status])

  let body
  if (status === 'error') {
    body = (
      <div className="sr-state" role="alert">
        <p>{t('error')}</p>
        <button type="button" className="btn btn-ghost" onClick={onRetry}>{t('retry')}</button>
      </div>
    )
  } else if (!data) {
    body = <DiscoverSkeleton />
  } else {
    const geoOn = geo.status === 'on'
    const locate = geo.supported && !geoOn ? (
      <button
        type="button" className="sr-geo" onClick={geo.request} disabled={geo.status === 'asking' || geo.pending}
        aria-label={t('useLocation')} title={t('useLocation')}
      >
        {geo.status === 'asking' ? <span className="spinner" aria-hidden="true" /> : <PinIcon size={18} />}
      </button>
    ) : null
    body = (
      <>
        <PopularChips items={popular} onQuery={onQuery} onCuisine={onCuisine} />
        {chips.length > 0 && (
          <section className="dsc-sec" aria-label={t('cuisines')}>
            <div className="dsc-head"><h2 className="dsc-h">{t('cuisines')}</h2></div>
            <CuisineChips chips={chips} value={filterCuisine} onPick={onCuisine} label={t('cuisines')} />
          </section>
        )}
        <RestaurantRail
          title={t(data.radiusKm != null || geoOn ? 'openNear' : 'openNow')}
          items={data.openNow}
          action={(
            <span className="sr-head-actions">
              {locate}
              {data.openNow.length > 0 && (
                <button type="button" className="sr-link-quiet" onClick={onSeeAllOpen}>{t('seeAll')} ›</button>
              )}
            </span>
          )}
        />
        <Section title={t('trending')} empty={data.trendingDishes.length === 0}>
          {data.trendingDishes.slice(0, TRENDING_SHOWN).map(d => <DishRow key={d.id} d={d} onOpen={onOpenDish} />)}
        </Section>
        <Section title={t('topReviews')} empty={data.topReviews.length === 0} className="sr-reviews">
          {data.topReviews.slice(0, REVIEWS_SHOWN).map(r => <CompactReview key={r.id} item={r} variant="row" where="full" />)}
        </Section>
        <Section title={t('allPlaces')} empty={allPlaces.length === 0}>
          {allPlaces.slice(0, shown).map(r => <PlaceRow key={r.id} r={r} onOpen={onOpenPlace} />)}
          {allPlaces.length > shown && (
            <div className="sr-more">
              <button type="button" className="btn btn-ghost" onClick={() => setShown(n => n + FIRST_PLACES)}>{t('showMore')}</button>
            </div>
          )}
        </Section>
      </>
    )
  }

  return (
    <div className="sr-zero">
      <RecentList recent={recent} onPick={onRecent} onRemove={onRemoveRecent} onClear={onClearRecent} />
      {body}
    </div>
  )
}
