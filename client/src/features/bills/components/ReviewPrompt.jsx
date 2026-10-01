import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Pill } from '../../../components/ui'
import { useAuth } from '../../../contexts/AuthContext'
import { categoryEmoji } from '../../../lib/helpers'
import { dishReviewState, getBill, submitReview } from '../api'
import { dishName } from '../mappers'

const MAX_DISHES = 3
const MAX_BODY = 300
const flagKey = billId => `rufesto_review_prompt_${billId}`

function wasDismissed(billId) {
  try { return localStorage.getItem(flagKey(billId)) === '1' } catch { return false }
}
function dismiss(billId) {
  try { localStorage.setItem(flagKey(billId), '1') } catch { /* private mode: it just shows again */ }
}

// Up to 3 distinct dishes from the viewer's own lines, the priciest first.
function ownDishes(bill) {
  const mine = bill.people.find(p => p.isMe)
  const seen = new Set()
  const out = []
  for (const item of [...(mine?.items || [])].sort((a, b) => b.lineTotal - a.lineTotal)) {
    if (!item.dishId || seen.has(item.dishId)) continue
    seen.add(item.dishId)
    out.push(item)
  }
  return out
}

/**
 * "How was your meal?" for a settled bill: rate up to 3 of the dishes you ordered, add one optional comment,
 * send. Reviews go to `reviews` (the server marks them verified once the visit exists). Shown once per bill:
 * "Not now" and a sent review hide it for good, and a dish you already reviewed is never offered again.
 * Pass the loaded `bill`, or just `billId` and it fetches the bill itself.
 */
export default function ReviewPrompt({ billId, bill: given }) {
  const { t, i18n } = useTranslation('bills')
  const lang = i18n.language?.startsWith('az') ? 'az' : 'en'
  const { session } = useAuth()
  const uid = session?.user?.id
  const [fetched, setFetched] = useState(null)
  const [phase, setPhase] = useState('loading')     // loading | hidden | form | sent
  const [dishes, setDishes] = useState([])
  const [ratings, setRatings] = useState({})
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [verified, setVerified] = useState(false)
  const sending = useRef(false)

  useEffect(() => {
    if (given || !billId || !uid) return undefined
    let cancelled = false
    getBill(billId).then(({ data }) => { if (!cancelled) setFetched(data) })
    return () => { cancelled = true }
  }, [given, billId, uid])

  const bill = given || fetched
  const settled = bill?.status === 'paid'
  const id = bill?.id

  useEffect(() => {
    if (!bill || !uid) return undefined
    if (!settled || wasDismissed(id)) { setPhase('hidden'); return undefined }
    let cancelled = false
    const candidates = ownDishes(bill)
    dishReviewState(uid, candidates.map(c => c.dishId)).then(({ data }) => {
      if (cancelled) return
      const open = data ? candidates.filter(c => !data.reviewed.includes(c.dishId)).slice(0, MAX_DISHES) : []
      setDishes(open.map(c => ({
        dishId: c.dishId,
        name: dishName(c, lang),
        emoji: categoryEmoji(data?.categories?.[c.dishId]),
      })))
      setPhase(open.length ? 'form' : 'hidden')
    })
    return () => { cancelled = true }
    // the bill object changes on every refetch; what matters is which bill it is and whether it is settled
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, settled, uid])

  if (phase === 'hidden' || phase === 'loading') return null

  function notNow() {
    dismiss(id)
    setPhase('hidden')
  }

  async function send() {
    if (sending.current) return
    const rated = dishes.filter(d => ratings[d.dishId] > 0)
    if (!rated.length) { setError(t('reviewPickRating')); return }
    sending.current = true
    setBusy(true)
    setError('')
    let anyVerified = false
    let failure = null
    const sent = new Set()
    for (let i = 0; i < rated.length; i += 1) {
      const d = rated[i]
      // one comment for the meal: it goes with the first rated dish
      const res = await submitReview({ userId: uid, dishId: d.dishId, rating: ratings[d.dishId], body: i === 0 ? body.trim() : '' })
      if (res.error && res.error.code !== 'review_exists') { failure = res.error; break }
      sent.add(d.dishId)
      if (res.data?.verified) anyVerified = true
    }
    sending.current = false
    setBusy(false)
    if (failure) {
      setDishes(prev => prev.filter(d => !sent.has(d.dishId)))
      setError(t(failure.key))
      return
    }
    dismiss(id)
    setVerified(anyVerified)
    setPhase('sent')
  }

  if (phase === 'sent') {
    return (
      <section className="card bl-review bl-noprint" role="status">
        <div className="bl-review-title">{t('reviewThanks')}</div>
        {verified ? <div className="bl-review-verified"><Pill tone="green">{t('reviewVerified')}</Pill></div> : null}
      </section>
    )
  }

  return (
    <section className="card bl-review bl-noprint" aria-labelledby="bl-review-title">
      <h2 id="bl-review-title" className="bl-review-title">{t('reviewTitle')}</h2>
      <ul className="bl-review-list">
        {dishes.map(d => (
          <li key={d.dishId} className="bl-review-row">
            <span className="bl-review-dish"><span aria-hidden="true">{d.emoji}</span> {d.name}</span>
            <div className="bl-stars" role="radiogroup" aria-label={d.name}>
              {[1, 2, 3, 4, 5].map(n => (
                <button
                  key={n} type="button" role="radio" aria-checked={ratings[d.dishId] === n}
                  aria-label={t('reviewRateAria', { dish: d.name, n })}
                  className={`bl-star${n <= (ratings[d.dishId] || 0) ? ' bl-star-on' : ''}`}
                  onClick={() => setRatings(r => ({ ...r, [d.dishId]: n }))}
                >
                  {n <= (ratings[d.dishId] || 0) ? '★' : '☆'}
                </button>
              ))}
            </div>
          </li>
        ))}
      </ul>
      <textarea
        className="input bl-textarea" rows={3} maxLength={MAX_BODY} value={body}
        placeholder={t('reviewPlaceholder')} aria-label={t('reviewPlaceholder')}
        onChange={e => setBody(e.target.value)}
      />
      <div className="bl-review-count">{body.length}/{MAX_BODY}</div>
      {error ? <p className="bl-hint bl-hint-error" role="alert">{error}</p> : null}
      <div className="bl-review-actions">
        <button type="button" className="btn btn-primary" disabled={busy} onClick={send}>
          {busy ? <span className="spinner" aria-hidden="true" /> : null}{t('reviewSend')}
        </button>
        <button type="button" className="btn btn-ghost" disabled={busy} onClick={notNow}>{t('reviewNotNow')}</button>
      </div>
    </section>
  )
}
