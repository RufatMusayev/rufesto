import { useCallback, useEffect, useMemo, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../contexts/AuthContext'
import { useCart } from '../../contexts/CartContext'
import { PullToRefresh } from '../../components/ui'
import LoadError from '../../components/LoadError'
import { useToast } from '../social/hooks'
import NotificationItem from './NotificationItem'
import { InboxSkeleton, EmptyInbox } from './InboxStates'
import SignedOut from './SignedOut'
import { GearIcon, ChevronLeftIcon } from './Icons'
import useInbox, { useThumbUrls } from './useInbox'
import { setInboxOpen, refreshBadge } from './badge'
import { markAllRead } from './api'
import { thumbOfItem } from '../../lib/notificationView'
import './styles.css'

const DAY_MS = 86400000

/**
 * Items (newest first) cut into New / This week / Earlier (docs/UX-PLAN-2026-10-18.md 2.2). New = unseen when the page opened;
 * This week = the rest younger than 7 days; Earlier = everything else. Rolling windows, never calendar days, so a row can
 * never sit under a heading that contradicts its time.
 */
function sectionsOf(items, now) {
  const week = now - 7 * DAY_MS
  const by = { new: [], week: [], earlier: [] }
  for (const it of items) by[it.isNew ? 'new' : (new Date(it.at).getTime() >= week ? 'week' : 'earlier')].push(it)
  return ['new', 'week', 'earlier'].filter(id => by[id].length).map(id => ({ id, items: by[id] }))
}

/** The signed URL for an item's photo when its thumbnail is a storage path (null when it is a ready URL, none, or unsigned). */
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

/** Page header: back (only when there is somewhere to go back to), the title, the settings gear. Nothing else. */
function Header() {
  const { t } = useTranslation('notifications')
  const navigate = useNavigate()
  // history.state.idx > 0 means there is somewhere to go back to inside the app
  const canGoBack = typeof window !== 'undefined' && (window.history.state?.idx ?? 0) > 0
  return (
    <header className="ntf-head">
      {canGoBack ? (
        <button type="button" className="icon-btn ntf-back" onClick={() => navigate(-1)} aria-label={t('prefsBack')}>
          <ChevronLeftIcon size={22} />
        </button>
      ) : <span className="ntf-head-gap" aria-hidden="true" />}
      <h1 className="ntf-title">{t('title')}</h1>
      <Link to="/settings/notifications" className="icon-btn ntf-gear" aria-label={t('settings')}>
        <GearIcon size={22} />
      </Link>
    </header>
  )
}

/** The page column with its header; `children` is what is under the header. */
function Shell({ children }) {
  return (
    <div className="ntf-page">
      <Header />
      {children}
    </div>
  )
}

function Inbox({ uid }) {
  const { t } = useTranslation('notifications')
  const navigate = useNavigate()
  const { tableId } = useCart()
  const { toast, showToast } = useToast()
  const inbox = useInbox()
  const { items, status, next, loadingMore, loadMore, read, confirm, decline, reload } = inbox
  const thumbs = useThumbUrls(items)
  const sentinel = useRef(null)

  // Opening the inbox is "looking at the bell": the badge clears at once (useInbox marks the rows seen once it has read them).
  // Leaving it marks everything read, so `read` stops mattering in the UI.
  useEffect(() => {
    setInboxOpen(true)
    return () => {
      setInboxOpen(false)
      markAllRead().then(() => refreshBadge())
    }
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

  const answer = useCallback(async (run, item) => {
    const { error } = await run(item)
    if (error) {
      showToast(error.key)
      reload()                                   // a request that is no longer there (answered elsewhere): show the truth
    }
  }, [showToast, reload])
  const onConfirm = useCallback(item => answer(confirm, item), [answer, confirm])
  const onDecline = useCallback(item => answer(decline, item), [answer, decline])

  const now = Date.now()
  const sections = useMemo(() => sectionsOf(items, now), [items]) // eslint-disable-line react-hooks/exhaustive-deps
  const hasTable = !!tableId

  return (
    <Shell>
      <PullToRefresh onRefresh={reload}>
        {status === 'loading' ? <InboxSkeleton /> : null}
        {status === 'error' ? <LoadError onRetry={reload} /> : null}
        {status === 'ready' && items.length === 0 ? <EmptyInbox /> : null}
        {status === 'ready' && items.length > 0 ? (
          <div className="ntf-fade">
            {sections.map(s => (
              <section key={s.id} aria-labelledby={`ntf-sec-${s.id}`}>
                <h2 className="ntf-sec" id={`ntf-sec-${s.id}`}>{t(s.id === 'new' ? 'sectionNew' : s.id === 'week' ? 'sectionWeek' : 'sectionEarlier')}</h2>
                <ul className="ntf-list">
                  {s.items.map(it => (
                    <NotificationItem
                      key={it.id}
                      item={it}
                      hasTable={hasTable}
                      thumbUrl={thumbUrlFor(thumbs, it)}
                      onOpen={open}
                      onConfirm={onConfirm}
                      onDecline={onDecline}
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
      </PullToRefresh>
      <div className="ntf-end" />
      {toast}
    </Shell>
  )
}
