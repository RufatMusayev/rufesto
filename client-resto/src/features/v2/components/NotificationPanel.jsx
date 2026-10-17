import { useEffect, useId, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../../contexts/AuthContext'
import useDialog from '../../../lib/useDialog'
import { canAccess } from '../../../lib/roles'
import { v2Error } from '../errors'
import { useNotifications } from '../notifContext'
import { KindIcon } from '../notifIcons'
import {
  collapseItems, itemAction, itemKind, itemRestaurantId, itemTarget, itemText, requestState, shortTime, splitSections,
} from '../notifItems'
import ErrorBanner from './ErrorBanner'
import LoadError from './LoadError'

const MARK_ALL_FROM = 3 // "Mark all read" only earns its place once a few are waiting
const CLOCK_MS = 30000 // the short times and the 2 h "Needs you" window re-read the clock this often

const svg = { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true }

function SpeakerIcon({ on }) {
  return on
    ? <svg {...svg}><path d="M11 5 6 9H3v6h3l5 4z" /><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" /></svg>
    : <svg {...svg}><path d="M11 5 6 9H3v6h3l5 4z" /><path d="m16 9 5 6M21 9l-5 6" /></svg>
}

// a card with a tick: a table paid (the shared kind icons have no "paid")
function PaidIcon() {
  return <svg {...svg}><rect x="3" y="5" width="18" height="14" rx="2.5" /><path d="M3 10h18" /><path d="m8.5 15.2 2 2 3.5-3.6" /></svg>
}

function useNow(ms) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms)
    return () => clearInterval(id)
  }, [ms])
  return now
}

// The one inline action of a row, under the time. A waiter call shows what became of it once it is not open.
function RowAction({ item, action, onOpen }) {
  const { t } = useTranslation(['v2'])
  const { requests, ackItem, ackingId, myName } = useNotifications()
  if (!action) return null

  if (action === 'ack') {
    const { state, by } = requestState(item, requests)
    if (state === 'acked') {
      const who = by === 'me' ? (myName || t('v2:notifAckedYou')) : t('v2:notifAckedOther')
      return (
        <span className="notif-ack">
          <span aria-hidden="true">✓ {who}</span>
          <span className="v2-sr-only">{t('v2:notifAckedSr', { staff: who })}</span>
        </span>
      )
    }
    if (state === 'done') return <span className="notif-ack"><span aria-hidden="true">✓</span> {t('v2:notifRequestDone')}</span>
    if (state === 'cancelled') return <span className="notif-ack is-muted">{t('v2:notifRequestCancelled')}</span>
    const busy = ackingId === item.id
    return (
      <button type="button" className="notif-act is-primary" onClick={() => ackItem(item)} disabled={!!ackingId} aria-busy={busy}>
        {busy && <span className="spinner" aria-hidden="true" />}
        {t('v2:notifActAck')}
      </button>
    )
  }

  const label = action === 'bill' ? t('v2:notifActOpenBill') : t('v2:notifActView')
  return <button type="button" className="notif-act" onClick={() => onOpen(item)}>{label}</button>
}

function Row({ item, restaurantTag, now, canOpen, onOpen }) {
  const { t, i18n } = useTranslation(['v2', 'common'])
  const { tableNumbers } = useNotifications()
  const kind = itemKind(item.type)
  const { title, detail } = itemText(item, { t, lang: i18n.language, tableNumbers })
  const meta = [detail, restaurantTag].filter(Boolean).join(' · ')
  const action = itemAction(item, canOpen)
  return (
    <li className={`notif-row${action ? ' has-action' : ''}`}>
      <button type="button" className={`notif-item${item.read ? '' : ' is-unread'}`} onClick={() => onOpen(item)}>
        <span className={`notif-icon notif-icon--${kind}`}>{kind === 'paid' ? <PaidIcon /> : <KindIcon kind={kind} />}</span>
        <span className="notif-text">
          <span className="notif-line">
            <span className="notif-item-title">
              {!item.read && <span className="v2-sr-only">{t('v2:notifUnread')}: </span>}
              {title}
            </span>
            {item.count > 1 && <span className="notif-count">×{item.count}</span>}
          </span>
          {meta && <span className="notif-detail">{meta}</span>}
        </span>
      </button>
      <span className="notif-side">
        <time className="notif-time" dateTime={item.latestAt || undefined}>{shortTime(item.latestAt, { t, now })}</time>
        <RowAction item={item} action={action} onOpen={onOpen} />
      </span>
    </li>
  )
}

// Slide-over of the staff notifications (V2-CONTRACT 21.5): right side on tablet / desktop, a full-height sheet on a
// phone (CSS). An Instagram-style list: "Needs you" (unread calls, bills, payments of the last 2 h) above "Earlier",
// rows folded per table, short times, one inline action per row ("On my way" for a waiter call).
export default function NotificationPanel() {
  const { t } = useTranslation(['v2', 'common', 'dashboard'])
  const navigate = useNavigate()
  const { staffRow, staffRows, hasMultipleRestaurants } = useAuth()
  const n = useNotifications()
  const uid = useId()
  const dialogRef = useDialog(n.closePanel)
  const role = staffRow?.role
  const canOpen = path => canAccess(role, path)
  const now = useNow(CLOCK_MS)
  const rows = useMemo(() => collapseItems(n.items), [n.items])
  const sections = useMemo(() => splitSections(rows, { now, requests: n.requests }), [rows, now, n.requests])

  // Several restaurants on one login: name the venue of rows that are not the active one.
  const tagFor = item => {
    if (!hasMultipleRestaurants) return ''
    const rid = itemRestaurantId(item)
    if (!rid || rid === staffRow?.restaurant_id) return ''
    return staffRows.find(s => s.restaurant_id === rid)?.restaurants?.name || ''
  }

  const openItem = item => {
    n.markRead(item)
    const to = itemTarget(item, canOpen)
    n.closePanel()
    if (to) navigate(to)
  }

  const showList = n.status === 'ready' || n.items.length > 0
  const unreadCount = Math.max(n.unread, n.items.reduce((sum, i) => (i.read ? sum : sum + i.count), 0))
  const chimeHint = `${t('v2:notifChime')}. ${t('v2:notifChimeHint')}`

  return (
    <div className="overlay notif-overlay" onClick={e => e.target === e.currentTarget && n.closePanel()}>
      <aside className="notif-panel" ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={`${uid}-title`}>
        <header className="notif-head">
          <h2 id={`${uid}-title`} className="notif-title">{t('v2:notifTitle')}</h2>
          {unreadCount >= MARK_ALL_FROM && (
            <button type="button" className="notif-text-btn" onClick={n.markAllRead}>{t('v2:notifMarkAll')}</button>
          )}
          <button
            type="button"
            className={`notif-icon-btn${n.chime ? ' is-on' : ''}`}
            aria-pressed={n.chime}
            aria-label={t('v2:notifChime')}
            title={chimeHint}
            onClick={() => n.setChime(!n.chime)}
          >
            <SpeakerIcon on={n.chime} />
          </button>
          <button type="button" className="modal-close" onClick={n.closePanel} aria-label={t('common:close')}>✕</button>
        </header>

        <div className="notif-body">
          {n.actionError && <ErrorBanner message={v2Error(n.actionError, t)} onDismiss={n.dismissActionError} />}

          {n.status === 'loading' && !showList && (
            <div className="notif-skeleton" aria-busy="true" aria-label={t('common:loading')}>
              {[0, 1, 2, 3].map(i => <div key={i} className="skeleton notif-skel-row" />)}
            </div>
          )}

          {n.status === 'error' && !showList && (
            <LoadError message={t('v2:notifLoadFailed')} onRetry={n.retry} />
          )}

          {showList && n.items.length === 0 && (
            <div className="notif-empty">
              <div className="notif-empty-icon" aria-hidden="true"><KindIcon kind="generic" /></div>
              <div className="v2-empty-title">{t('v2:notifEmptyTitle')}</div>
              <p className="v2-empty-body">{t('v2:notifEmptyBody')}</p>
            </div>
          )}

          {sections.map(section => {
            const label = t(`v2:notifSection_${section.key}`)
            // A lone "Earlier" says nothing: its heading shows only next to "Needs you".
            const heading = section.key === 'needs' || sections.length > 1
            return (
              <section key={section.key} className="notif-section" aria-label={label}>
                {heading && <h3 className="notif-day">{label}</h3>}
                <ul className="notif-list">
                  {section.items.map(item => (
                    <Row key={item.id} item={item} restaurantTag={tagFor(item)} now={now} canOpen={canOpen} onOpen={openItem} />
                  ))}
                </ul>
              </section>
            )
          })}

          {n.hasMore && (
            <button type="button" className="btn btn-ghost notif-more" onClick={n.loadMore} disabled={n.loadingMore}>
              {n.loadingMore && <span className="spinner" aria-hidden="true" />}
              {t('v2:notifLoadMore')}
            </button>
          )}
        </div>

        <footer className="notif-foot">
          <Link to="/settings?tab=notifications" className="notif-settings-link" onClick={n.closePanel}>
            {t('v2:notifSettingsLink')}
          </Link>
        </footer>
      </aside>
    </div>
  )
}
