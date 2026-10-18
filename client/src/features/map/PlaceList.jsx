import { memo, useCallback, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Avatar } from '../../components/ui'
import PlaceRow from '../search/rows/PlaceRow'
import '../discover/styles.css'
import '../search/styles.css'

// PlaceRow reads the shape of a Discover card; a map place is mapped onto it once per row
const asCard = p => ({
  id: p.id, slug: p.slug, name: p.name, cuisine: p.cuisine_type, logo: null, coverPhoto: p.cover, coverFallback: null,
  openNow: p.open_now, opensAt: null, isNew: false,
})

/**
 * One row. `meta` is { key, line1, state, status, tail, fr }: the second line is the open state in its colour plus the distance
 * (or, without a location, the street), the third line (only where friends have been) a tiny avatar stack and a short
 * "Nicat has been here". `key` changes whenever any of it does, so the row is only re-rendered then.
 */
const Row = memo(function Row({ place, selected, hovered, tab, meta, onSelect, onHover, onFocusRow }) {
  const lines = [
    meta.line1,
    <span key="st" className="mp-st-line"><span className={`mp-st is-${meta.state}`}>{meta.status}</span>{meta.tail ? ` · ${meta.tail}` : ''}</span>,
  ]
  if (meta.fr) {
    lines.push(
      <span key="fr" className="mp-row-fr">
        <span className="mp-row-av" aria-hidden="true">
          {meta.fr.people.map((f, i) => <Avatar key={i} name={f.name} src={f.photo} size={16} />)}
        </span>
        <span className="mp-row-frt">{meta.fr.text}</span>
      </span>,
    )
  }
  return (
    <li
      className={`mp-li${selected ? ' is-selected' : ''}${hovered ? ' is-hover' : ''}${meta.state === 'closed' ? ' is-closed' : ''}`}
      data-id={place.id}
      onPointerEnter={onHover ? e => { if (e.pointerType === 'mouse') onHover(place.id) } : undefined}
      onPointerLeave={onHover ? e => { if (e.pointerType === 'mouse') onHover(null, place.id) } : undefined}
    >
      <PlaceRow
        r={asCard(place)}
        meta={lines}
        selected={selected}
        onSelect={() => onSelect(place)}
        rowProps={{ tabIndex: tab ? 0 : -1, onFocus: e => onFocusRow(place.id, e) }}
      />
    </li>
  )
}, (a, b) => a.place === b.place && a.selected === b.selected && a.hovered === b.hovered && a.tab === b.tab && a.onSelect === b.onSelect
  && a.onHover === b.onHover && a.meta.key === b.meta.key)

/**
 * The list of places: the screen-reader alternative to the map (docs/MAP-PLAN-2026-10-18.md 8, a11y). The rows are the
 * Search rows (PlaceRow) used as selectors. One tab stop for the whole list; ArrowUp / ArrowDown / Home / End move
 * between rows, Enter or Space selects, Escape deselects (roving tabindex, in list order).
 *   places      already filtered and ordered
 *   metaFor     (place) -> the row's meta (see Row)
 *   onHover     desktop: the row lifts its pin and the pin lifts the row
 *   onKeyFocus  a row got keyboard focus (phone: raise the sheet so the row can be seen)
 *   expanded    desktop: { id, node } the selected row is replaced in place by this card
 */
export default memo(function PlaceList({
  places, status, selectedId, hoveredId, metaFor, onSelect, onHover, onEscape, onKeyFocus, filtersOn, onClearFilters, onRetry, expanded,
}) {
  const { t } = useTranslation('map')
  const [active, setActive] = useState(null)
  const ul = useRef(null)
  const activeId = places.some(p => p.id === active) ? active : places[0]?.id
  // a row reached with the keyboard must be visible: the phone sheet rises to its scrolling snap
  const onFocusRow = useCallback((id, e) => {
    setActive(id)
    if (onKeyFocus && e?.target?.matches?.(':focus-visible')) onKeyFocus()
  }, [onKeyFocus])

  const onKeyDown = useCallback(e => {
    if (e.key === 'Escape') { onEscape?.(); return }
    const keys = ['ArrowDown', 'ArrowUp', 'Home', 'End']
    if (!keys.includes(e.key)) return
    const rows = Array.from(ul.current?.querySelectorAll('button.sr-row') || [])
    if (!rows.length) return
    const at = rows.indexOf(document.activeElement)
    let next = at
    if (e.key === 'ArrowDown') next = Math.min(rows.length - 1, at + 1)
    else if (e.key === 'ArrowUp') next = Math.max(0, at - 1)
    else if (e.key === 'Home') next = 0
    else next = rows.length - 1
    e.preventDefault()
    rows[next]?.focus({ preventScroll: false })
  }, [onEscape])

  if (status === 'loading' || (status === 'idle' && !places.length)) {
    return (
      <div className="mp-skel" aria-hidden="true">
        {[0, 1, 2, 3, 4, 5].map(i => (
          <div key={i} className="mp-skel-row">
            <span className="skeleton mp-skel-thumb" />
            <span className="mp-skel-lines"><span className="skeleton" /><span className="skeleton" /></span>
          </div>
        ))}
      </div>
    )
  }
  if (status === 'error' && !places.length) {
    return (
      <div className="mp-empty" role="alert">
        <p>{t('loadFailed')}</p>
        <button type="button" className="mp-retry" onClick={onRetry}>{t('retry')}</button>
      </div>
    )
  }
  if (!places.length) {
    return (
      <div className="mp-empty" role="status">
        <p>{filtersOn ? t('noneMatch') : t('noPlaces')}</p>
        {filtersOn && <button type="button" className="mp-retry" onClick={onClearFilters}>{t('clearFilters')}</button>}
      </div>
    )
  }

  return (
    <ul ref={ul} className="mp-list" aria-label={t('listLabel')} onKeyDown={onKeyDown}>
      {places.map(p => (expanded && expanded.id === p.id
        ? <li key={p.id} className="mp-li mp-li--expanded" data-id={p.id}>{expanded.node}</li>
        : (
          <Row
            key={p.id} place={p} selected={p.id === selectedId} hovered={p.id === hoveredId} tab={p.id === activeId} meta={metaFor(p)}
            onSelect={onSelect} onHover={onHover} onFocusRow={onFocusRow}
          />
        )))}
    </ul>
  )
})
