import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import ListHead from './ListHead'
import PlaceList from './PlaceList'

/**
 * The side panel of the desktop layout (384 px) and the whole screen of list mode (no WebGL2): title, "10 places · 6 open",
 * chips and the rows. The selected row opens in place into the place card (`expanded`). docs/MAP-PLAN-2026-10-18.md 3.
 */
export default function PlacePanel({ list, head, selectedId, expanded, notice, full = false }) {
  const { t } = useTranslation('map')
  const scroller = useRef(null)

  // a pin was tapped: bring its row into view inside the panel (never scrollIntoView: it could move the page)
  useEffect(() => {
    const sc = scroller.current
    if (!sc || selectedId == null) return
    const li = sc.querySelector(`[data-id="${CSS.escape(String(selectedId))}"]`)
    if (!li) return
    const top = li.offsetTop
    const bottom = top + li.offsetHeight
    if (top < sc.scrollTop) sc.scrollTop = Math.max(0, top - 8)
    else if (bottom > sc.scrollTop + sc.clientHeight) sc.scrollTop = bottom - sc.clientHeight + 8
  }, [selectedId, expanded?.node])

  return (
    <aside className={`mp-panel${full ? ' mp-panel--full' : ''}`} aria-label={t('listLabel')}>
      <header className="mp-panel-top">
        <h2 className="mp-panel-title">{t('mapLabel')}</h2>
        <ListHead {...head} />
        {notice ? <p className="mp-panel-note">{notice}</p> : null}
      </header>
      <div ref={scroller} className="mp-panel-scroll" data-bs-scroll="">
        <PlaceList {...list} selectedId={selectedId} expanded={expanded} />
      </div>
    </aside>
  )
}
