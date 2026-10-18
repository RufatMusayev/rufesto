import { decimal } from './format'
import { openState } from '../../lib/openState'
import { distanceText } from './distance'
import { kindWords, shortAddress } from './kind'
import { statusLabel } from './status'

/**
 * The short "who has been here" line, the same on a row and on a card so it always fits and always keeps its verb:
 * "Nicat has been here" / "Nicat +2 have been here" (first name only; the avatars say the rest).
 * null without friends or a name.
 */
export function friendsLine(t, friends) {
  const first = String(friends?.top?.[0]?.name || '').trim().split(/\s+/)[0]
  if (!friends || !(friends.count > 0) || !first) return null
  const text = friends.count === 1 ? t('friendsOne', { name: first }) : t('friendsRowMany', { name: first, count: friends.count - 1 })
  const people = friends.top.slice(0, 3).map(x => ({ id: x.id, name: x.name, photo: x.profile_photo }))
  return { text, people, key: `${text}|${people.map(x => x.photo || '').join(',')}` }
}

/**
 * What a list row says (docs/MAP-PLAN-2026-10-18.md 3; QA round 2): the kind / cuisine, rating and price; the open state with
 * the distance (with a location) or the street (without one); and, where friends have been, a short "Nicat has been here".
 * `key` changes whenever anything shown does, so a row is only rendered again then. `t` = translate of the map namespace.
 */
export function rowMeta({ place: p, t, lang, nowMin, km }) {
  const st = openState(p, nowMin)
  const rating = p.rating != null && p.review_count > 0 ? `★${decimal(p.rating, 1, lang)} (${p.review_count})` : null
  const price = p.price_band ? '₼'.repeat(p.price_band) : null
  const line1 = [kindWords(t, p), rating, price].filter(Boolean).join(' · ')
  const status = statusLabel(t, st)
  const tail = km != null ? distanceText(t, km, lang) : shortAddress(p.address)

  const fr = friendsLine(t, p.friends)
  return { line1, state: st.state, status, tail, fr, key: [line1, st.state, status, tail, fr ? fr.key : ''].join('|') }
}
