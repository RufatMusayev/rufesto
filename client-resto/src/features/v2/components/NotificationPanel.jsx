import { useId, useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { timeAgo } from '@shared/helpers'
import { useAuth } from '../../../contexts/AuthContext'
import useDialog from '../../../lib/useDialog'
import { canAccess } from '../../../lib/roles'
import { v2Error } from '../errors'
import { useNotifications } from '../notifContext'
import { KindIcon } from '../notifIcons'
import { groupByDay, itemKind, itemRestaurantId, itemTarget, itemText } from '../notifItems'
import ErrorBanner from './ErrorBanner'
import LoadError from './LoadError'
import Switch from './Switch'

function Row({ item, restaurantTag, onOpen }) {
  const { t, i18n } = useTranslation(['v2', 'common'])
  const { tableNumbers } = useNotifications()
  const kind = itemKind(item.type)
  const { title, detail } = itemText(item, { t, lang: i18n.language, tableNumbers })
  const meta = [detail, restaurantTag].filter(Boolean).join(' · ')
  return (
    <li>
      <button type="button" className={`notif-item${item.read ? '' : ' is-unread'}`} onClick={() => onOpen(item)}>
        <span className={`notif-icon notif-icon--${kind}`}><KindIcon kind={kind} /></span>
        <span className="notif-text">
          <span className="notif-line">
            <span className="notif-item-title">{title}</span>
            {item.count > 1 && <span className="notif-count">×{item.count}</span>}
          </span>
          {meta && <span className="notif-detail">{meta}</span>}
        </span>
        <span className="notif-side">
          <span className="notif-time">{timeAgo(item.latestAt, i18n.language)}</span>
          {!item.read && <span className="notif-dot"><span className="v2-sr-only">{t('v2:notifUnread')}</span></span>}
        </span>
      </button>
    </li>
  )
}

// Slide-over of the staff notifications (V2-CONTRACT 21.5): right side on tablet / desktop, a full-height sheet on a
// phone (CSS). Rows come grouped from my_notifications('staff') and are sectioned by day (Baku calendar).
export default function NotificationPanel() {
  const { t } = useTranslation(['v2', 'common', 'dashboard'])
  const navigate = useNavigate()
  const { staffRow, staffRows, hasMultipleRestaurants } = useAuth()
  const n = useNotifications()
  const uid = useId()
  const dialogRef = useDialog(n.closePanel)
  const role = staffRow?.role
  const canOpen = path => canAccess(role, path)
  const sections = useMemo(() => groupByDay(n.items), [n.items])

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
  const hasUnread = n.unread > 0 || n.items.some(i => !i.read)

  return (
    <div className="overlay notif-overlay" onClick={e => e.target === e.currentTarget && n.closePanel()}>
      <aside className="notif-panel" ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={`${uid}-title`}>
        <header className="notif-head">
          <h2 id={`${uid}-title`} className="notif-title">{t('v2:notifTitle')}</h2>
          <button type="button" className="notif-text-btn" onClick={n.markAllRead} disabled={!hasUnread}>
            {t('v2:notifMarkAll')}
          </button>
          <button type="button" className="modal-close" onClick={n.closePanel} aria-label={t('common:close')}>✕</button>
        </header>

        <div className="notif-sound">
          <div className="notif-sound-text">
            <label className="notif-sound-label" htmlFor={`${uid}-chime`}>{t('v2:notifChime')}</label>
            <span className="notif-sound-hint">{t('v2:notifChimeHint')}</span>
          </div>
          <Switch id={`${uid}-chime`} checked={n.chime} onChange={n.setChime} label={t('v2:notifChime')} />
        </div>

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

          {sections.map(section => (
            <section key={section.key} className="notif-section" aria-label={t(`v2:notifDay_${section.key}`)}>
              <h3 className="notif-day">{t(`v2:notifDay_${section.key}`)}</h3>
              <ul className="notif-list">
                {section.items.map(item => (
                  <Row key={item.id} item={item} restaurantTag={tagFor(item)} onOpen={openItem} />
                ))}
              </ul>
            </section>
          ))}

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
