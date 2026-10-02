import { useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { GridIcon, CalendarIcon, StarIcon, PlateIcon, ReceiptIcon } from './Icons'

export const TAB_IDS = ['posts', 'bookings', 'reviews', 'saved', 'visits']

const ICONS = {
  posts: GridIcon, bookings: CalendarIcon, reviews: StarIcon, saved: PlateIcon, visits: ReceiptIcon,
}
const LABELS = {
  posts: 'tabPosts', bookings: 'tabBookings', reviews: 'tabReviews', saved: 'tabSaved', visits: 'tabVisits',
}

export const tabDomId = id => `pf-tab-${id}`
export const panelDomId = id => `pf-panel-${id}`

/**
 * Sticky segmented tabs. The active tab shows icon + label, the others only the icon (five labels
 * do not fit at 360px, least of all in Azerbaijani). Arrow keys, Home and End move between tabs
 * (roving tabindex).
 */
export default function ProfileTabs({ value, onChange }) {
  const { t } = useTranslation('profile')
  const refs = useRef({})

  function onKeyDown(e) {
    const i = TAB_IDS.indexOf(value)
    let next = null
    if (e.key === 'ArrowRight') next = TAB_IDS[(i + 1) % TAB_IDS.length]
    else if (e.key === 'ArrowLeft') next = TAB_IDS[(i - 1 + TAB_IDS.length) % TAB_IDS.length]
    else if (e.key === 'Home') next = TAB_IDS[0]
    else if (e.key === 'End') next = TAB_IDS[TAB_IDS.length - 1]
    if (!next) return
    e.preventDefault()
    onChange(next)
    refs.current[next]?.focus()
  }

  return (
    <div id="pf-tabs" className="pf-tabs-bar">
      <div className="pf-seg" role="tablist" aria-label={t('sections')} onKeyDown={onKeyDown}>
        {TAB_IDS.map(id => {
          const Icon = ICONS[id]
          const active = id === value
          return (
            <button
              key={id} id={tabDomId(id)} type="button" role="tab"
              ref={el => { refs.current[id] = el }}
              className={`pf-tab${active ? ' active' : ''}`}
              aria-selected={active} aria-controls={panelDomId(id)} tabIndex={active ? 0 : -1}
              aria-label={t(LABELS[id])} title={t(LABELS[id])}
              onClick={() => onChange(id)}
            >
              <Icon size={18} />
              <span className="pf-tab-label">{t(LABELS[id])}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
