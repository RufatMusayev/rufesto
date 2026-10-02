import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useCart } from '../../../contexts/CartContext'
import useFloorPlan from '../useFloorPlan'
import { useCellSize, useMySeat } from '../hooks'
import { COLS, layoutFloor } from '../layout'
import Legend from './Legend'
import PixelFloor from './PixelFloor'
import TableDetail from './TableDetail'

const OTHER = '' // id of "tables without a section"

/**
 * The guest's floor plan sheet, drawn as a retro pixel map: tables are pixel blocks with their number, every
 * seat is a small square around its table (taken seats lit, free seats dim). Live: realtime `tables` changes
 * and a short poll refetch floor_plan(). Fit to width, scroll vertically; no pinch.
 * Props are the ones RestaurantPage already passes to FloorPlanSheet: restaurant, onClose, onReserve(table).
 */
export default function FloorSheet({ restaurant, onClose, onReserve }) {
  const { t } = useTranslation(['floor', 'common'])
  const cart = useCart() || {}
  const { plan, loading, error, live, reload } = useFloorPlan(restaurant.id)
  const [section, setSection] = useState('all')
  const [selectedId, setSelectedId] = useState(null)
  const stageRef = useRef(null)
  const cell = useCellSize(stageRef, COLS)
  const seat = useMySeat(cart.tableId)

  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const tables = plan?.tables
  const sectionList = useMemo(() => {
    if (!plan) return []
    const used = new Set(plan.tables.map(tb => tb.sectionId))
    const list = plan.sections.filter(s => used.has(s.id))
    if (used.has(OTHER)) list.push({ id: OTHER, name: t('sectionOther') })
    return list
  }, [plan, t])
  const sectionNames = useMemo(() => new Map(sectionList.map(s => [s.id, s.name])), [sectionList])

  // Falls back to "all" when the chosen section has no tables any more (a table moved, live).
  const activeSection = section === 'all' || sectionNames.has(section) ? section : 'all'
  const visible = useMemo(
    () => (tables || []).filter(tb => activeSection === 'all' || tb.sectionId === activeSection),
    [tables, activeSection],
  )

  // Geometry only: a state or seat change must not move any block, so the layout depends on this key.
  const geometryKey = visible.map(tb => `${tb.id}:${tb.capacity}:${tb.x}:${tb.y}:${tb.w}:${tb.h}:${tb.shape}:${tb.sectionId}`).join('|')
  const sectionOrder = useMemo(() => sectionList.map(s => s.id), [sectionList])
  const layout = useMemo(
    () => layoutFloor(visible, { sectionOrder }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [geometryKey, sectionOrder],
  )
  const tablesById = useMemo(() => new Map(visible.map(tb => [tb.id, tb])), [visible])

  const selected = selectedId ? tablesById.get(selectedId) || null : null
  useEffect(() => { if (selectedId && !tablesById.has(selectedId)) setSelectedId(null) }, [selectedId, tablesById])
  const toggle = id => setSelectedId(prev => (prev === id ? null : id))

  // The guest's own table session (cart context) and chair (my_table_session). A pending guest is not seated yet.
  const pending = cart.sessionStatus === 'pending'
  const seatHere = seat && seat.tableId === cart.tableId ? seat.seatNo : null
  const mine = cart.tableId && !pending ? { tableId: cart.tableId, seatNo: seatHere } : null
  const held = selected && cart.tableId === selected.id ? { seatNo: seatHere, pending } : null

  const states = useMemo(() => new Set(visible.map(tb => tb.state)), [visible])
  const showMine = !!mine && mine.seatNo !== null && tablesById.has(mine.tableId)

  return (
    <div className="overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="sheet fl-sheet" role="dialog" aria-modal="true" aria-labelledby="fl-title">
        <div className="sheet-handle" />

        <header className="fl-head">
          <div>
            <div className="fl-title-row">
              <h2 id="fl-title" className="fl-title">{t('title')}</h2>
              {live && (
                <span className="fl-live">
                  <span className="avail-pulse fl-live-dot" aria-hidden="true" />
                  {t('common:live')}
                </span>
              )}
            </div>
            <p className="fl-sub">{t('subtitle', { name: restaurant.name })}</p>
          </div>
          <button type="button" className="icon-btn fl-close" onClick={onClose} aria-label={t('close')}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </header>

        {sectionList.length > 1 && (
          <div className="fl-chips no-scrollbar" role="group" aria-label={t('sectionsLabel')}>
            <button type="button" className={`chip${activeSection === 'all' ? ' active' : ''}`} aria-pressed={activeSection === 'all'} onClick={() => setSection('all')}>
              {t('sectionAll')}
            </button>
            {sectionList.map(s => (
              <button key={s.id || 'other'} type="button" className={`chip${activeSection === s.id ? ' active' : ''}`} aria-pressed={activeSection === s.id} onClick={() => setSection(s.id)}>
                {s.name}
              </button>
            ))}
          </div>
        )}

        {plan && visible.length > 0 && <Legend states={states} showMine={showMine} />}

        <div className="fl-scroll">
          <div className="fl-stage" ref={stageRef}>
            {loading ? (
              <div className="fl-state" role="status"><span className="spinner" aria-label={t('common:loading')} /></div>
            ) : error && !plan ? (
              <div className="fl-state" role="alert">
                <p>{t('loadError')}</p>
                <button type="button" className="btn btn-ghost" onClick={reload}>{t('retry')}</button>
              </div>
            ) : visible.length === 0 ? (
              <div className="fl-state"><p>{t('empty')}</p></div>
            ) : (
              <PixelFloor
                layout={layout}
                tablesById={tablesById}
                sectionNames={sectionNames}
                cell={cell}
                selectedId={selectedId}
                mine={mine}
                label={t('mapLabel', { name: restaurant.name })}
                entranceLabel={t('entrance')}
                onSelect={toggle}
              />
            )}
          </div>
        </div>

        <div className="fl-foot">
          {selected ? (
            <TableDetail
              key={selected.id}
              table={selected}
              sectionName={sectionNames.get(selected.sectionId) || ''}
              held={held}
              onClose={() => setSelectedId(null)}
              onReserve={onReserve ? tb => onReserve({
                id: tb.id, table_number: tb.number, capacity: tb.capacity, state: tb.state,
                sections: { name: sectionNames.get(tb.sectionId) || null },
              }) : null}
            />
          ) : (
            <p className="fl-hint">{t('hint')}</p>
          )}
        </div>
      </div>
    </div>
  )
}
