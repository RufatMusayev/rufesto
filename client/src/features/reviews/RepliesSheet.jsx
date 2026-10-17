import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Avatar, BottomSheet } from '../../components/ui'
import LoadError from '../../components/LoadError'
import { useAuth } from '../../contexts/AuthContext'
import { timeShort } from '../../lib/timeShort'
import { useRequireAuth } from '../social/hooks'
import { getReplies, addReviewReply, deleteReviewReply } from './api'
import { guestName } from './names'
import { CloseGlyph, SendGlyph } from './Icons'
import CompactReview from './CompactReview'
import './i18n'
import './reviews.css'

const MAX_REPLY = 500            // review_comments_body_max_len (sql/52d)

/**
 * The replies of one review (docs/UX-PLAN-2026-10-18.md 4.4): the review itself on top, the replies oldest first, a composer
 * pinned to the bottom. Mounted by CompactReview while open (self-managed BottomSheet: it animates out, then onClose
 * unmounts it). `onCount(n)` reports the real number of replies after a load, an add or a delete. A signed-out guest
 * who focuses the input gets the sign-in sheet.
 */
export default function RepliesSheet({ item, onClose, onCount }) {
  const { t, i18n } = useTranslation('reviews')
  const { session, profile } = useAuth()
  const { requireAuth, authModal } = useRequireAuth()
  const userId = session?.user?.id || null
  const me = session ? { name: profile?.name || null, photo: profile?.profile_photo || null } : null
  const [state, setState] = useState({ loading: true, error: null, items: [], next: null })
  const [more, setMore] = useState(false)
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [sendError, setSendError] = useState('')
  const seq = useRef(0)
  const items = useRef([])
  const end = useRef(null)
  items.current = state.items
  const text = body.trim()

  const load = useCallback(async () => {
    const mine = ++seq.current
    setState(s => ({ ...s, loading: true, error: null }))
    const { data, error } = await getReplies({ reviewId: item.id, userId })
    if (mine !== seq.current) return
    if (error) { setState({ loading: false, error, items: [], next: null }); return }
    setState({ loading: false, error: null, items: data.items, next: data.nextCursor })
    if (!data.nextCursor) onCount?.(data.items.length)        // the whole thread was read: the count is exact
  }, [item.id, userId, onCount])

  useEffect(() => { load(); return () => { seq.current++ } }, [load])

  async function loadMore() {
    if (!state.next || more) return
    setMore(true)
    const { data } = await getReplies({ reviewId: item.id, userId, cursor: state.next })
    setMore(false)
    if (!data) return
    setState(s => {
      const seen = new Set(s.items.map(x => x.id))
      return { ...s, items: [...s.items, ...data.items.filter(x => !seen.has(x.id))], next: data.nextCursor }
    })
  }

  async function send(e) {
    e.preventDefault()
    if (busy || !text || !requireAuth()) return
    setBusy(true)
    setSendError('')
    const temp = {
      id: `tmp-${Date.now()}`, user: { id: userId, name: me?.name || null, photo: me?.photo || null },
      body: text, createdAt: new Date().toISOString(), mine: true, pending: true,
    }
    setState(s => ({ ...s, items: [...s.items, temp] }))
    setBody('')
    requestAnimationFrame(() => end.current?.scrollIntoView({ block: 'nearest' }))
    const { data, error } = await addReviewReply(item.id, userId, text)
    setBusy(false)
    if (error) {
      setState(s => ({ ...s, items: s.items.filter(x => x.id !== temp.id) }))
      setBody(text)
      setSendError(t('replyFailed'))
      return
    }
    setState(s => ({ ...s, items: s.items.map(x => (x.id === temp.id ? data : x)) }))
    onCount?.(items.current.length)
  }

  async function remove(reply) {
    const { error } = await deleteReviewReply(reply.id)
    if (error) return
    setState(s => ({ ...s, items: s.items.filter(x => x.id !== reply.id) }))
    onCount?.(items.current.length)
  }

  const composer = (
    <form className="rv-composer" onSubmit={send}>
      {sendError && <p className="rv-composer-err" role="alert">{sendError}</p>}
      <div className="rv-composer-row">
        <input
          className="rv-composer-input" type="text" value={body} maxLength={MAX_REPLY} enterKeyHint="send" autoComplete="off"
          placeholder={t('replyPlaceholder')} aria-label={t('replyPlaceholder')}
          onFocus={e => { if (!requireAuth()) e.target.blur() }}
          onChange={e => setBody(e.target.value)}
        />
        <button type="submit" className="rv-composer-send" disabled={busy || !text}>
          <span className="rv-composer-label">{t('replySend')}</span>
          <SendGlyph size={18} />
        </button>
      </div>
    </form>
  )

  return (
    <BottomSheet
      onClose={onClose} title={t('repliesTitle')} size="large" id="replies" footer={composer} padded={false}
      bodyClassName="rv-sheet-body"
    >
      <div className="rv-thread-review">
        <CompactReview item={item} variant="row" showActions={false} />
      </div>
      <div className="rv-replies">
        {state.loading && state.items.length === 0 && (
          <div aria-busy="true">{[0, 1].map(i => <div key={i} className="skeleton rv-reply-sk" />)}</div>
        )}
        {state.error && <LoadError onRetry={load} />}
        {!state.loading && !state.error && state.items.length === 0 && <p className="rv-replies-empty">{t('noReplies')}</p>}
        {state.items.map(r => {
          const name = guestName(r.user.name, t('guest'))
          return (
            <div key={r.id} className={`rv-reply${r.pending ? ' is-pending' : ''}`}>
              {r.user.id
                ? <Link to={`/u/${r.user.id}`} className="rv-reply-av" aria-label={name}><Avatar name={name} src={r.user.photo} size={28} /></Link>
                : <span className="rv-reply-av"><Avatar name={name} src={r.user.photo} size={28} /></span>}
              <div className="rv-reply-main">
                <div className="rv-reply-head">
                  <span className="rv-reply-name">{name}</span>
                  <time className="rv-time" dateTime={r.createdAt}>{timeShort(r.createdAt, i18n.language)}</time>
                </div>
                <p className="rv-reply-body">{r.body}</p>
              </div>
              {r.mine && !r.pending && (
                <button type="button" className="rv-reply-del" aria-label={t('replyDelete')} onClick={() => remove(r)}>
                  <CloseGlyph size={13} />
                </button>
              )}
            </div>
          )
        })}
        {state.next && (
          <button type="button" className="rv-more-btn" onClick={loadMore} disabled={more}>{t('loadMore')}</button>
        )}
        <div ref={end} />
      </div>
      {authModal}
    </BottomSheet>
  )
}
