import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Pill } from '../../../components/ui'
import { cleanDisplayName } from '../../../lib/helpers'
import { sendFriendRequest, removeFriend } from '../api'
import ConfirmSheet from './ConfirmSheet'

/**
 * The one place a relationship status becomes a label and an action.
 * status: 'none' | 'pending_out' | 'pending_in' | 'friends' | 'blocked' | 'self'
 * variant 'compact' (list rows: Add button / Pending pill / Friends pill) or 'full' (profile header).
 * onChange(userId, newStatus) is called optimistically and reverted on failure; onError(i18nKey).
 * guard() must return true when the guest is signed in (opens AuthModal otherwise).
 */
export default function FriendButton({
  userId, status, name, variant = 'compact', onChange, onError, guard = () => true,
}) {
  const { t } = useTranslation('social')
  const [pending, setPending] = useState(false)
  const [sheet, setSheet] = useState(false)
  const [sheetError, setSheetError] = useState(null)

  async function add() {
    if (pending || !guard()) return
    setPending(true)
    const prev = status
    onChange?.(userId, prev === 'pending_in' ? 'friends' : 'pending_out')
    const { data, error } = await sendFriendRequest(userId)
    setPending(false)
    if (error) {
      onChange?.(userId, prev)
      onError?.(error.key)
      return
    }
    onChange?.(userId, data.status)
  }

  async function undo() {
    if (pending) return
    setPending(true)
    setSheetError(null)
    const { error } = await removeFriend(userId)
    setPending(false)
    if (error) { setSheetError(error.key); return }
    setSheet(false)
    onChange?.(userId, 'none')
  }

  if (status === 'self') {
    return variant === 'full'
      ? <Link to="/profile" className="btn btn-ghost soc-btn-block">{t('friend.thisIsYou')}</Link>
      : null
  }
  if (status === 'blocked') return null

  const full = variant === 'full'
  const cls = full ? 'soc-btn-block' : 'soc-btn-sm'

  let node = null
  if (status === 'none' || status === 'pending_in') {
    const label = status === 'pending_in' ? t('friend.accept') : (full ? t('friend.addFriend') : t('friend.add'))
    node = (
      <button type="button" className={`btn btn-primary ${cls}`} onClick={add} disabled={pending}>
        {pending ? <span className="spinner" aria-hidden="true" /> : null}
        {label}
      </button>
    )
  } else if (status === 'pending_out') {
    node = full ? (
      <button type="button" className={`btn btn-ghost ${cls}`} onClick={() => { setSheetError(null); setSheet(true) }}>
        {t('friend.requestSent')}
      </button>
    ) : <Pill tone="gray">{t('friend.pending')}</Pill>
  } else if (status === 'friends') {
    node = full ? (
      <button type="button" className={`btn btn-ghost ${cls}`} onClick={() => { setSheetError(null); setSheet(true) }}>
        {t('friend.friendsCheck')}
      </button>
    ) : <Pill tone="green">{t('friend.friends')}</Pill>
  }

  const cancelling = status === 'pending_out'
  const who = cleanDisplayName(name)
  return (
    <>
      {node}
      <ConfirmSheet
        open={sheet}
        title={cancelling ? t('friend.cancelTitle') : t('friend.removeTitle', { name: who })}
        body={cancelling ? t('friend.cancelBody', { name: who }) : t('friend.removeBody', { name: who })}
        confirmLabel={cancelling ? t('friend.cancelConfirm') : t('friend.removeConfirm')}
        pending={pending}
        error={sheetError}
        onConfirm={undo}
        onClose={() => setSheet(false)}
      />
    </>
  )
}
