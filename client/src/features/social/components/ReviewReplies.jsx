import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import LoadError from '../../../components/LoadError'
import { listReviewReplies, addReviewReply, deleteReviewReply, REPLIES_LIMIT } from '../api'
import CommentRow, { CommentSkeletons } from './CommentRow'
import CommentComposer from './CommentComposer'

/**
 * The reply thread of a review, expanded inside its card (the same review_comments table the app always used for
 * replies). Replies are oldest first and readable signed out; the reply box asks a signed-out guest to sign in when it
 * gets focus. `onCount(n)` reports the number of replies after a load, an add or a delete, so the card's counter and
 * the feed lists stay right. `me` is { name, photo } of the viewer (null signed out).
 */
export default function ReviewReplies({ reviewId, userId, me, guard, onCount, panelId }) {
  const { t } = useTranslation('social')
  const [state, setState] = useState({ loading: true, error: null, items: [] })
  const seq = useRef(0)
  const items = useRef([])
  items.current = state.items

  const load = useCallback(async () => {
    const mine = ++seq.current
    setState(s => ({ ...s, loading: true, error: null }))
    const { data, error } = await listReviewReplies(reviewId, userId)
    if (mine !== seq.current) return
    if (error) { setState({ loading: false, error, items: [] }); return }
    setState({ loading: false, error: null, items: data })
    if (data.length < REPLIES_LIMIT) onCount(data.length)         // the whole thread was read: the count is exact
  }, [reviewId, userId, onCount])

  useEffect(() => { load(); return () => { seq.current++ } }, [load])

  const send = useCallback(async body => {
    const temp = {
      id: 'tmp-' + Date.now(), user: { id: userId, name: me?.name || null, photo: me?.photo || null },
      body, createdAt: new Date().toISOString(), mine: true, pending: true,
    }
    setState(s => ({ ...s, items: [...s.items, temp] }))
    const { data, error } = await addReviewReply(reviewId, userId, body)
    if (error) {
      setState(s => ({ ...s, items: s.items.filter(x => x.id !== temp.id) }))
      return { error }
    }
    setState(s => ({ ...s, items: s.items.map(x => (x.id === temp.id ? data : x)) }))
    onCount(items.current.length)
    return { error: null }
  }, [reviewId, userId, me?.name, me?.photo, onCount])

  const remove = useCallback(async reply => {
    const { error } = await deleteReviewReply(reply.id)
    if (error) return { error }
    setState(s => ({ ...s, items: s.items.filter(x => x.id !== reply.id) }))
    onCount(items.current.length)
    return { error: null }
  }, [onCount])

  return (
    <div className="soc-replies" id={panelId}>
      {state.loading && <CommentSkeletons count={2} />}
      {state.error && <LoadError onRetry={load} />}
      {!state.loading && !state.error && state.items.length === 0 && <p className="soc-replies-empty">{t('review.noReplies')}</p>}
      {state.items.map(r => <CommentRow key={r.id} comment={r} canDelete={r.mine} onDelete={remove} />)}
      <CommentComposer
        inline me={me} guard={guard} onSend={send} max={500}
        placeholder={t('review.replyPlaceholder')}
      />
    </div>
  )
}
