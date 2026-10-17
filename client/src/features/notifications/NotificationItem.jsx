import { memo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { timeAgo } from '../../lib/helpers'
import { describeItem } from '../../lib/notificationView'
import Leading from './Leading'

function Thumb({ src }) {
  const [broken, setBroken] = useState(false)
  if (!src || broken) return null
  return <img className="ntf-thumb" src={src} alt="" loading="lazy" onError={() => setBroken(true)} />
}

/**
 * One inbox line (a group of rows collapsed by the server). A button: tapping it marks the group read and goes to its
 * target. `thumbUrl` is the signed URL of the post / dish photo the payload carries, when there is one.
 */
function NotificationItem({ item, thumbUrl, onOpen }) {
  const { t, i18n } = useTranslation('notifications')
  const view = describeItem(item, t, i18n.language)
  const thumb = view.thumb ? (view.thumb.src || thumbUrl || null) : null

  return (
    <li className="stagger-item ntf-li">
      <button
        type="button"
        className={`ntf-item${item.read ? '' : ' unread'}`}
        onClick={() => onOpen(item, view.to)}
      >
        <Leading view={view} actors={item.actors} />
        <span className="ntf-body">
          <span className="ntf-text">{view.text}</span>
          <span className="ntf-meta">
            <time dateTime={item.at}>{timeAgo(item.at, i18n.language)}</time>
            {item.count > 1 && !item.actors.length ? <span> · {t('updates', { count: item.count })}</span> : null}
          </span>
        </span>
        <Thumb src={thumb} />
        {item.read ? null : (
          <>
            <span className="ntf-dot" aria-hidden="true" />
            <span className="sr-only">{t('unread')}</span>
          </>
        )}
      </button>
    </li>
  )
}

export default memo(NotificationItem)
