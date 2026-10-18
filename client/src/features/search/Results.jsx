import { useTranslation } from 'react-i18next'
import { RowSkeleton } from '../discover/components/DiscoverSkeleton'
import PlaceRow from './rows/PlaceRow'
import DishRow from './rows/DishRow'
import PersonRow from './rows/PersonRow'
import { PopularChips } from './ZeroState'

const ALL_PLACES = 3
const ALL_DISHES = 6
const ALL_PEOPLE = 3
const TAB_MAX = 40

function Head({ title, onMore }) {
  const { t } = useTranslation('search')
  return (
    <div className="sr-sec-head">
      <h2 className="sr-sec-title">{title}</h2>
      {onMore && <button type="button" className="sr-link-quiet" onClick={onMore}>{t('seeAll')} ›</button>}
    </div>
  )
}

/**
 * Typing / results (UX plan 3.3). Tabs All | Places | Dishes | People (People only for a signed-in guest). "All" is
 * Places (3) then Dishes (6) then People (3), each with "See all ›" that opens its tab; a single tab lists up to 40.
 */
export default function Results({
  q, tab, onTab, signedIn, search, people, popular, onQuery, onCuisine, onOpenPlace, onOpenDish, guard,
}) {
  const { t } = useTranslation('search')
  const { places, dishes, skeleton, empty, error, retry, loading, mode } = search
  const peopleOn = signedIn && mode !== 'browse'
  const tabs = ['all', 'places', 'dishes', ...(peopleOn ? ['people'] : [])]
  const current = tabs.includes(tab) ? tab : 'all'
  const showPlaces = current === 'all' || current === 'places'
  const showDishes = current === 'all' || current === 'dishes'
  const showPeople = peopleOn && (current === 'all' || current === 'people')
  const placeRows = places.slice(0, current === 'places' ? TAB_MAX : ALL_PLACES)
  const dishRows = dishes.slice(0, current === 'dishes' ? TAB_MAX : ALL_DISHES)
  const peopleRows = people.rows.slice(0, current === 'people' ? TAB_MAX : ALL_PEOPLE)
  const all = current === 'all'

  // the tab has nothing to show (after the answer is in): say so with the Popular chips again
  const tabEmpty = !loading && !error && (
    (current === 'places' && places.length === 0)
    || (current === 'dishes' && dishes.length === 0)
    || (current === 'people' && people.enabled && people.status === 'ready' && people.rows.length === 0)
    || (all && empty && (!peopleOn || !people.enabled || people.status !== 'loading') && people.rows.length === 0)
  )

  return (
    <div className="sr-results">
      <div className="sr-tabs" role="tablist" aria-label={t('tabs.label')}>
        {tabs.map(id => (
          <button
            key={id} type="button" role="tab" aria-selected={current === id} className="sr-tab"
            onClick={() => onTab(id)}
          >
            {t(`tabs.${id}`)}
          </button>
        ))}
      </div>

      {error ? (
        <div className="sr-state" role="alert">
          <p>{t('error')}</p>
          <button type="button" className="btn btn-ghost" onClick={retry}>{t('retry')}</button>
        </div>
      ) : (
        <div className="sr-list" aria-busy={loading}>
          {loading && <div className="sr-progress" aria-hidden="true" />}
          {skeleton && <RowSkeleton n={6} />}

          {showPlaces && placeRows.length > 0 && (
            <section aria-label={t('places')}>
              {all && <Head title={t('places')} onMore={places.length > ALL_PLACES ? () => onTab('places') : null} />}
              {placeRows.map(r => <PlaceRow key={r.id} r={r} q={q} onOpen={onOpenPlace} />)}
            </section>
          )}

          {showDishes && dishRows.length > 0 && (
            <section aria-label={t('dishes')}>
              {all && <Head title={t('dishes')} onMore={dishes.length > ALL_DISHES ? () => onTab('dishes') : null} />}
              {dishRows.map(d => <DishRow key={d.id} d={d} q={q} onOpen={onOpenDish} />)}
            </section>
          )}

          {showPeople && people.enabled && peopleRows.length > 0 && (
            <section aria-label={t('people')}>
              {all && <Head title={t('people')} onMore={people.rows.length > ALL_PEOPLE ? () => onTab('people') : null} />}
              {peopleRows.map(p => (
                <PersonRow key={p.id} p={p} q={q} guard={guard} onStatus={people.setStatus} />
              ))}
            </section>
          )}

          {current === 'people' && peopleOn && !people.enabled && <p className="sr-hint">{t('typeMore')}</p>}
          {current === 'people' && people.enabled && people.status === 'loading' && <RowSkeleton n={3} />}

          {tabEmpty && (
            <div className="sr-empty">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
                <circle cx="10.5" cy="10.5" r="7" /><line x1="16" y1="16" x2="21.5" y2="21.5" />
              </svg>
              <p className="sr-empty-title">{mode === 'browse' ? t('noResultsFilters') : t('noResults', { q: q.trim() })}</p>
              <p className="sr-empty-hint">{mode === 'browse' ? t('noResultsFiltersHint') : t('noResultsHint')}</p>
              <PopularChips items={popular} onQuery={onQuery} onCuisine={onCuisine} />
            </div>
          )}
        </div>
      )}
    </div>
  )
}
