import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigationType, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../contexts/AuthContext'
import { useRequireAuth, useDebounced } from '../social/hooks'
import { useStore } from '../feed/store'
import { useViewerLocation } from '../feed/useViewerLocation'
import { useDishAvailabilityPoll } from '../feed/dishAvailability'
import { discoverStore, discoverKey, ensureDiscover, reloadDiscover, currentViewer } from '../discover/discoverStore'
import DishSheetHost from '../../components/dish/DishSheetHost'
import { useDishLink } from '../../components/dish/dishLink'
import { prefetchDishSheet } from '../../components/dish/prefetch'
import SearchField from './SearchField'
import ActiveFilters from './ActiveFilters'
import ZeroState, { popularChips } from './ZeroState'
import Results from './Results'
import { useSearch, usePeople } from './useSearch'
import { TABS, activeCount, readFilters, writeFilters } from './filters'
import { addRecent, clearRecent, getRecent, removeRecent } from './recent'
import './i18n'
import './styles.css'

const FiltersSheet = lazy(() => import('./FiltersSheet'))

// Scroll position per history entry: Back from a restaurant returns to the same query, tab and scroll (UX plan 3.9 #6).
const scrollMemory = new Map()

function useScrollMemory(key, restoreWhen) {
  const type = useNavigationType()
  const last = useRef(0)
  const restored = useRef(false)
  useEffect(() => {
    let raf = 0
    const onScroll = () => {
      if (raf) return
      raf = requestAnimationFrame(() => { raf = 0; last.current = window.scrollY })
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => { window.removeEventListener('scroll', onScroll); cancelAnimationFrame(raf) }
  }, [])
  // the entry is saved when the page leaves (layout cleanup runs before the next page's content is in the DOM)
  useLayoutEffect(() => () => { scrollMemory.set(key, last.current) }, [key])
  useLayoutEffect(() => {
    if (restored.current || !restoreWhen) return
    restored.current = true
    const y = type === 'POP' ? scrollMemory.get(key) : 0
    if (y) window.scrollTo({ top: y, behavior: 'instant' })
  }, [restoreWhen, type, key])
}

/**
 * Search (was Explore, UX plan section 3). The zero state is the Discover content; typing gives Places / Dishes /
 * People, Filters is a sheet. Everything the guest chose lives in the URL (/explore?q=&open=1&cuisine=&price=&km=&diet=&tab=),
 * so Back restores it. A dish opens as a sheet over this page (?dish=<id>, pushed).
 */
export default function SearchPage() {
  const { t } = useTranslation('search')
  const { t: ts, i18n } = useTranslation('social')
  const location = useLocation()
  const [params, setParams] = useSearchParams()
  const { session, loading: authLoading } = useAuth()
  const { requireAuth, authModal } = useRequireAuth()
  const geo = useViewerLocation()
  const { open: openDish } = useDishLink()
  const userId = session?.user?.id || null
  const lat = geo.coords?.lat ?? null
  const lng = geo.coords?.lng ?? null

  const filters = useMemo(() => readFilters(params), [params])
  const tabParam = params.get('tab')
  const tab = TABS.includes(tabParam) ? tabParam : 'all'
  const [text, setText] = useState(() => params.get('q') || '')
  const [focused, setFocused] = useState(false)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [filtersLoaded, setFiltersLoaded] = useState(false)       // the sheet mounts on first use, then stays (it animates out)
  const [recent, setRecent] = useState(getRecent)
  const inputRef = useRef(null)
  const typed = text.trim()
  const filterCount = activeCount(filters)

  useEffect(() => { prefetchDishSheet() }, [])
  useDishAvailabilityPoll()   // a dish row flips to "Sold out" on its own (QA D-3)

  // ---- URL <-> state -----------------------------------------------------------------------------------------
  // Two rules keep the Filters sheet and the address apart (QA D-4, B-R2-1). The sheet pushes a history entry on this very URL.
  //  - `update` keeps its identity for good (setParams changes whenever the location does): otherwise the sheet opening would
  //    re-run the debounced sync below with the OLD settled text and rewrite the address, closing the sheet again (D-4);
  //  - the sync does not run while the sheet is open, and a write made FROM the sheet ("Show results") replaces the sheet's own
  //    entry WITHOUT its history state, so the sheet sees its entry replaced (not popped) and the filter stays (B-R2-1: carrying
  //    the state along made closing the sheet pop the entry that held the filter).
  const paramsRef = useRef(params)
  paramsRef.current = params
  const setParamsRef = useRef(setParams)
  setParamsRef.current = setParams
  const update = useCallback(mutate => {
    const next = new URLSearchParams(paramsRef.current)
    mutate(next)
    if (next.toString() !== paramsRef.current.toString()) setParamsRef.current(next, { replace: true })
  }, [])

  const settledText = useDebounced(typed, 300)
  useEffect(() => {
    if (filtersOpen) return
    update(p => {
      if (settledText) p.set('q', settledText); else p.delete('q')
      if (!settledText && !activeCount(readFilters(p))) p.delete('tab')
    })
  }, [settledText, filtersOpen, update])

  const setFilters = useCallback(next => update(p => writeFilters(p, next)), [update])
  const setTab = useCallback(id => update(p => { if (id === 'all') p.delete('tab'); else p.set('tab', id) }), [update])

  // ---- the zero-state answer (discover) ---------------------------------------------------------------------
  const store = useStore(discoverStore)
  useEffect(() => {
    if (authLoading || geo.pending) return
    ensureDiscover({ userId, lat, lng, cuisine: null })
  }, [authLoading, geo.pending, userId, lat, lng])
  const dargs = { userId: authLoading ? currentViewer() : userId, lat, lng, cuisine: null }
  const entry = store.entries[discoverKey(dargs)]
  const discover = entry?.status === 'ready' ? entry.data : null

  // ---- search ----------------------------------------------------------------------------------------------
  const search = useSearch({ q: text, filters, coords: geo.coords, discover })
  const people = usePeople({ q: text, enabled: !!session })
  const chips = store.chips
  const popular = useMemo(() => popularChips(discover, chips, ts, i18n.language), [discover, chips, ts, i18n.language])

  const showResults = search.mode !== 'zero'
  useScrollMemory(location.key, showResults ? !search.loading : !!discover || entry?.status === 'error')

  // ---- actions ---------------------------------------------------------------------------------------------
  const remember = useCallback(q => { if (q && q.trim().length >= 2) setRecent(addRecent(q)) }, [])
  const pickQuery = useCallback(q => { setText(q); remember(q) }, [remember])
  const pickCuisine = useCallback(key => setFilters({ ...filters, cuisine: key }), [filters, setFilters])
  const cancel = () => { setText(''); update(p => { p.delete('q'); p.delete('tab') }) }

  return (
    <div className="sr-page">
      <h1 className="sr-only">{t('title')}</h1>
      <SearchField
        value={text} onChange={setText} inputRef={inputRef}
        focused={focused} onFocusChange={setFocused}
        onSubmit={() => { remember(typed); inputRef.current?.blur() }}
        onCancel={cancel}
        filtersCount={filterCount} onFilters={() => { setFiltersLoaded(true); setFiltersOpen(true) }}
      />
      <ActiveFilters filters={filters} onChange={setFilters} />

      {showResults ? (
        <Results
          q={text} tab={tab} onTab={setTab} signedIn={!!session} search={search} people={people} popular={popular}
          onQuery={pickQuery} onCuisine={pickCuisine} guard={requireAuth}
          onOpenPlace={() => remember(typed)}
          onOpenDish={d => { remember(typed); openDish(d) }}
        />
      ) : (
        <ZeroState
          data={discover} status={entry?.status === 'error' ? 'error' : 'loading'} onRetry={() => reloadDiscover(dargs)}
          chips={chips} geo={geo} filterCuisine={filters.cuisine}
          recent={recent} onRecent={pickQuery}
          onRemoveRecent={q => setRecent(removeRecent(q))} onClearRecent={() => setRecent(clearRecent())}
          onQuery={pickQuery} onCuisine={pickCuisine}
          onSeeAllOpen={() => setFilters({ ...filters, open: true })}
          onOpenDish={openDish}
        />
      )}

      {filtersLoaded && (
        <Suspense fallback={null}>
          <FiltersSheet
            open={filtersOpen} onClose={() => setFiltersOpen(false)}
            filters={filters} chips={chips} geo={geo}
            onApply={next => { setFilters(next); setFiltersOpen(false) }}
          />
        </Suspense>
      )}
      <DishSheetHost />
      {authModal}
    </div>
  )
}
