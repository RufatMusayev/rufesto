import { useCallback, useDeferredValue, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import LoadError from '../../../components/LoadError'
import { normalizeDesign, sectionTitle, toSheetDish } from '../mappers'
import { accentVars } from './color'
import { sectionIcon } from './icons'
import { buildHaystacks, filterMenu, DIETS } from './search'
import { useScrollSpy } from './useScrollSpy'
import MenuSection from './MenuSection'
import MenuSearch from './MenuSearch'
import SectionNav from './SectionNav'
import './menu.css'
import './themes/classic.css'
import './themes/bistro.css'
import './themes/modern.css'
import './themes/cafe.css'

const DEFAULT_DESIGN = normalizeDesign(null)

function MenuSkeleton() {
  return (
    <div className="mn-wrap" data-menu="classic" aria-busy="true">
      <div className="mn mn--skeleton">
        <div className="skeleton mn-sk-title" />
        <div className="skeleton mn-sk-line" />
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="mn-sk-row">
            <div className="skeleton mn-sk-name" />
            <div className="skeleton mn-sk-desc" />
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * Menu tab: the restaurant's menu printed in its own theme (classic / bistro / modern / cafe), from the
 * restaurant_menu view-model. Sticky section navigator with scroll-spy, search, dietary filters. Typography and
 * colour live in menu.css + themes/*.css; the accent colour is the only inline value (a CSS custom property).
 *  menuState  { status, menu, retry } from useMenu
 *  seated     the guest sits at this restaurant: rows get the inline "+" (CartContext.addDish via onAdd)
 *  active     the tab is showing (the scroll-spy only runs then)
 */
export default function MenuTab({ menuState, restaurant, seated, active, onOpenDish, onAdd }) {
  const { t, i18n } = useTranslation('restaurant')
  const lang = (i18n.resolvedLanguage || i18n.language || 'en').slice(0, 2)
  const { status, menu, retry } = menuState
  const [query, setQuery] = useState('')
  const [diets, setDiets] = useState([])
  const deferred = useDeferredValue(query)
  const searchRef = useRef(null)

  const design = menu?.design || DEFAULT_DESIGN
  const vars = useMemo(() => accentVars(design.theme, design.accent), [design.theme, design.accent])
  const haystacks = useMemo(() => (menu ? buildHaystacks(menu) : null), [menu])
  const sections = useMemo(
    () => (menu ? filterMenu(menu, haystacks, deferred, diets) : []),
    [menu, haystacks, deferred, diets],
  )
  const counts = useMemo(() => {
    const out = {}
    for (const f of DIETS) out[f.key] = menu ? menu.sections.reduce((n, s) => n + s.dishes.filter(f.test).length, 0) : 0
    return out
  }, [menu])

  const items = useMemo(() => sections.map(s => ({
    key: s.key,
    title: sectionTitle(s, lang),
    icon: design.theme === 'cafe' ? sectionIcon(s.name) : null,
  })), [sections, lang, design.theme])
  const spy = useScrollSpy(useMemo(() => items.map(i => i.key), [items]), active && status === 'ready')

  // Rows are memoized, so the handlers must keep one identity; they read the latest props through a ref.
  const live = useRef({})
  live.current = { onOpenDish, onAdd, lang, restaurant }
  const open = useCallback(d => live.current.onOpenDish(toSheetDish(d, live.current.lang, live.current.restaurant)), [])
  const add = useCallback(d => live.current.onAdd(toSheetDish(d, live.current.lang, live.current.restaurant)), [])
  const toggleDiet = useCallback(k => setDiets(p => (p.includes(k) ? p.filter(x => x !== k) : [...p, k])), [])
  const clearDiets = useCallback(() => setDiets([]), [])
  const focusSearch = useCallback(() => {
    const input = searchRef.current
    if (!input) return
    input.closest('.mn-tools')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    input.focus({ preventScroll: true })
  }, [])

  if (status === 'error') return <LoadError onRetry={retry} />
  if (status !== 'ready' || !menu) return <MenuSkeleton />

  const filtering = deferred.trim() !== '' || diets.length > 0
  const clearAll = () => { setQuery(''); setDiets([]) }

  return (
    <div className="mn-wrap" data-menu={design.theme} style={vars}>
      {items.length > 1 && (
        <SectionNav
          items={items}
          active={spy.active}
          onJump={spy.jump}
          onSearch={focusSearch}
          label={t('menu.sectionsLabel')}
          searchLabel={t('menu.searchLabel')}
        />
      )}
      <article className="mn">
        <header className="mn-head">
          <p className="mn-kicker">{t('menu.kicker')}</p>
          <h2 className="mn-title">{restaurant.name}</h2>
          <span className="mn-orn" aria-hidden="true"><i /><b /><i /></span>
          {design.note && <p className="mn-note">{design.note}</p>}
        </header>

        <MenuSearch
          ref={searchRef}
          value={query}
          onChange={setQuery}
          diets={diets}
          onToggleDiet={toggleDiet}
          onClearDiets={clearDiets}
          counts={counts}
        />

        {menu.dishCount === 0 && (
          <div className="mn-empty" role="status">
            <p className="mn-empty-title">{t('menu.emptyTitle')}</p>
            <p className="mn-empty-body">{t('menu.emptyBody')}</p>
          </div>
        )}

        {menu.dishCount > 0 && sections.length === 0 && (
          <div className="mn-empty" role="status">
            <p className="mn-empty-title">
              {deferred.trim() ? t('menu.noMatchFor', { q: deferred.trim() }) : t('menu.noMatch')}
            </p>
            {filtering && (
              <button type="button" className="mn-clear" onClick={clearAll}>{t('menu.clearFilters')}</button>
            )}
          </div>
        )}

        {sections.map(s => (
          <MenuSection
            key={s.key}
            id={s.key}
            title={sectionTitle(s, lang)}
            icon={design.theme === 'cafe' ? sectionIcon(s.name) : null}
            dishes={s.dishes}
            lang={lang}
            photos={design.showPhotos}
            seated={seated}
            onOpen={open}
            onAdd={add}
          />
        ))}

        {menu.dishCount > 0 && (
          <footer className="mn-foot">
            <span className="mn-orn" aria-hidden="true"><i /><b /><i /></span>
            <p className="mn-live"><span className="mn-live-dot" aria-hidden="true" />{t('menu.liveNote')}</p>
          </footer>
        )}
      </article>
    </div>
  )
}
