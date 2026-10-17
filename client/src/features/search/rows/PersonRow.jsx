import { memo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Avatar } from '../../../components/ui'
import { cleanDisplayName } from '../../../lib/helpers'
import { sendFriendRequest } from '../../social/api'
import Hl from './Hl'

/**
 * A person: 56 px row, avatar, name, "N mutual friends" and a 32 px button. "Add friend" sends the request and turns
 * into "Requested" at once (back to "Add friend" if the server says no). A pending incoming request is accepted by the
 * same call (the RPC accepts instead of creating a second request), so its button reads "Accept".
 */
export default memo(function PersonRow({ p, q = '', guard, onStatus, onOpen }) {
  const { t } = useTranslation('search')
  const { t: ts } = useTranslation('social')
  const [busy, setBusy] = useState(false)
  const name = cleanDisplayName(p.name)

  async function add() {
    if (busy || !guard()) return
    setBusy(true)
    const prev = p.status
    onStatus(p.id, prev === 'pending_in' ? 'friends' : 'pending_out')
    const { data, error } = await sendFriendRequest(p.id)
    setBusy(false)
    onStatus(p.id, error ? prev : data.status)
  }

  let action = null
  if (p.status === 'none' || p.status === 'pending_in') {
    action = (
      <button type="button" className="btn btn-primary sr-btn" disabled={busy} onClick={add}>
        {p.status === 'pending_in' ? ts('friend.accept') : t('addFriend')}
      </button>
    )
  } else if (p.status === 'pending_out') {
    action = <span className="sr-btn sr-btn-done">{t('requested')}</span>
  } else if (p.status === 'friends') {
    action = <span className="sr-btn sr-btn-done">{t('friends')}</span>
  }
  return (
    <div className="sr-row sr-row-person">
      <Link to={`/u/${p.id}`} className="sr-person-link" onClick={() => onOpen?.(p)}>
        <Avatar name={p.name} src={p.photo} size={40} />
        <span className="sr-main">
          <span className="sr-name"><Hl text={name} q={q} /></span>
          {p.mutual > 0 && <span className="sr-meta">{t('mutual', { count: p.mutual })}</span>}
        </span>
      </Link>
      {action}
    </div>
  )
})
