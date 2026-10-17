import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../contexts/AuthContext'
import LoadError from '../../components/LoadError'
import { bakuDateOf } from '../bookings/timeFormat'
import NotificationItem from './NotificationItem'
import FilterChips from './FilterChips'
import { InboxSkeleton, EmptyInbox } from './InboxStates'
import SignedOut from './SignedOut'
import { GearIcon } from './Icons'
import useInbox, { useThumbUrls } from './useInbox'
import { setInboxOpen } from './badge'
import { thumbOfItem } from '../../lib/notificationView'
import './styles.css'

const DAY_MS = 86400000

/** Items (newest first) cut into Today / Yesterday / Earlier on the Baku calendar, the clock the app shows times in. */
function sectionsOf(items) {
  const today = bakuDateOf(Date.now())
  const yesterday = bakuDateOf(Date.now() - DAY_MS)
  const out = []
  for (const it of items) {
    const d = bakuDateOf(it.at)
    const id = d === today ? 'today' : d === yesterday ? 'yesterday' : 'earlier'
    const last = out[out.length - 1]
    if (last && last.id === id) last.items.push(it)
    else out.push({ id, items: [it] })
  }
  return out
}

/** The signed URL for an item's post photo (null when it carries a ready URL, none, or the path could not be signed). */
function thumbUrlFor(thumbs, item) {
  const th = thumbOfItem(item)
  return th && th.path ? thumbs.get(th.path) || null : null
}

export default function NotificationsPage() {
  const { session, loading: authLoading } = useAuth()
  if (authLoading) return <Shell><InboxSkeleton /></Shell>
  if (!session) return <SignedOut />
  return <Inbox uid={session.user.id} />
}

/** Title bar + the page column; `children` is what is under the header. */
function Shell({ children, header }) {
  const { t } = useTranslation('notifications')
  return (
    <div className="ntf-page">
      {header || (
        <div className="ntf-head">
          <div className="ntf-bar"><h1 className="ntf-title">{t('title')}</h1></div>
        </div>
      )}
      {children}
    </div>
  )
}

function Inbox({ uid }) {
  const { t } = useTranslation('notifications')
  const navigate = useNavigate()
  const [category, setCategory] = useState(null)
  const inbox = useInbox(category)
  const { items, unread, status, next, loadingMore, loadMore, read, readAll, reload } = inbox
  const thumbs = useThumbUrls(items)
  const sentinel = useRef(null)

  // opening the inbox is "looking at the bell": the badge clears, the rows become seen (not read)
  useEffect(() => {
    setInboxOpen(true)
    return () => setInboxOpen(false)
  }, [uid])

  // the next page loads by itself when the end of the list comes near; the button below it is the same thing by hand
  useEffect(() => {
    const el = sentinel.current
    if (!next || !el || typeof IntersectionObserver === 'undefined') return undefined
    const io = new IntersectionObserver(entries => { if (entries[0].isIntersecting) loadMore() }, { rootMargin: '400px' })
    io.observe(el)
    return () => io.disconnect()
  }, [next, loadMore, items.length])

  const open = useCallback((item, to) => {
    read(item)
    if (to) navigate(to)
  }, [read, navigate])

  const sections = useMemo(() => sectionsOf(items), [items])

  const header = (
    <div className="ntf-head">
      <div className="ntf-bar">
        <h1 className="ntf-title">
          {t('title')}
          {unread > 0 ? (
            <span className="ntf-count" aria-label={t('unreadCount', { count: unread })}>{unread > 99 ? '99+' : unread}</span>
          ) : null}
        </h1>
        <div className="ntf-actions">
          {unread > 0 ? (
            <button type="button" className="btn btn-ghost ntf-markall" onClick={readAll}>{t('markAllRead')}</button>
          ) : null}
          <Link to="/settings/notifications" className="icon-btn ntf-gear" aria-label={t('settings')}>
            <GearIcon size={20} />
          </Link>
        </div>
      </div>
      <FilterChips value={category} onChange={setCategory} />
    </div>
  )

  return (
    <Shell header={header}>
      {status === 'loading' ? <InboxSkeleton /> : null}
      {status === 'error' ? <LoadError onRetry={reload} /> : null}
      {status === 'ready' && items.length === 0 ? <EmptyInbox category={category} /> : null}
      {status === 'ready' && items.length > 0 ? (
        <div>
          {sections.map(s => (
            <section key={s.id} aria-labelledby={`ntf-day-${s.id}`}>
              <h2 className="ntf-day" id={`ntf-day-${s.id}`}>{t(s.id)}</h2>
              <ul className="ntf-list">
                {s.items.map(it => (
                  <NotificationItem
                    key={it.id}
                    item={it}
                    thumbUrl={thumbUrlFor(thumbs, it)}
                    onOpen={open}
                  />
                ))}
              </ul>
            </section>
          ))}
          {next ? (
            <div className="ntf-more" ref={sentinel}>
              <button type="button" className="btn btn-ghost" onClick={loadMore} disabled={loadingMore}>
                {loadingMore ? t('loadingMore') : t('loadMore')}
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
      <div className="ntf-end" />
    </Shell>
  )
}
