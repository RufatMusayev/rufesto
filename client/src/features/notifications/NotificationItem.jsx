import { memo } from 'react'
import { useTranslation } from 'react-i18next'
import { Img } from '../../components/ui'
import { timeShort } from '../../lib/timeShort'
import { describeItem, richParts } from '../../lib/notificationView'
import Leading from './Leading'

/**
 * One inbox line (a group of rows collapsed by the server), docs/UX-PLAN-2026-10-18.md 2.2: leading avatar or icon, the sentence
 * with the actor and the venue in bold and the short time at its end, a 44 px thumbnail on the right. No background, stripe or
 * dot for "unread": novelty is the "New" section. A tap marks the group read and goes to its target.
 * An incoming friend request carries Confirm / Delete under the text (they do not open the row): Confirm turns the sentence
 * into "X is now your friend." and fades the buttons away, Delete collapses the row.
 * `thumbUrl` is the signed URL of the photo the item's `thumb` names, when it is a storage path.
 */
function NotificationItem({ item, hasTable, thumbUrl, onOpen, onConfirm, onDecline }) {
  const { t, i18n } = useTranslation('notifications')
  const view = describeItem(item, t, i18n.language, { hasTable })
  const thumb = view.thumb ? (view.thumb.src || thumbUrl || null) : null
  const pending = item.friendStatus === 'pending'

  return (
    <li className={`ntf-li${item.leaving ? ' is-leaving' : ''}`}>
      <div className="ntf-li-in">
        <button type="button" className="ntf-main" onClick={() => onOpen(item, view.to)}>
          <Leading view={view} actors={item.actors} />
          <span className="ntf-text" key={item.friendStatus || 'x'}>
            {richParts(view.rich).map((p, i) => (p.b ? <strong key={i}>{p.s}</strong> : p.s))}
            {' '}
            <time className="ntf-time" dateTime={item.at}>{timeShort(item.at, i18n.language)}</time>
          </span>
          {thumb && <Img className="ntf-thumb" src={thumb} ratio="1/1" />}
        </button>
        {(pending || item.fading) && (
          <div className={`ntf-actions${pending ? '' : ' is-fading'}`}>
            <button type="button" className="ntf-btn ntf-btn-yes" disabled={!pending} onClick={() => onConfirm(item)}>
              {t('friendConfirm')}
            </button>
            <button type="button" className="ntf-btn ntf-btn-no" disabled={!pending} onClick={() => onDecline(item)}>
              {t('friendDelete')}
            </button>
          </div>
        )}
      </div>
    </li>
  )
}

export default memo(NotificationItem)
