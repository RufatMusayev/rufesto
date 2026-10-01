import { Link } from 'react-router-dom'
import { Avatar } from '../../../components/ui'
import { cleanDisplayName } from '../../../lib/helpers'

/** One person in a list: avatar + name (both open /u/:id), optional subtitle, optional right-hand node.
 *  `stack` drops the right-hand node under the name on narrow screens (two buttons would squeeze the name). */
export default function FriendRow({ user, subtitle, right, size = 44, stack = false }) {
  const name = cleanDisplayName(user.name)
  return (
    <div className={`soc-row stagger-item${stack ? ' soc-row-stack' : ''}`}>
      <Link to={`/u/${user.id}`} className="soc-row-main" aria-label={name}>
        <Avatar name={user.name} src={user.photo} size={size} />
        <span className="soc-row-text">
          <span className="soc-row-name">{name}</span>
          {subtitle ? <span className="soc-row-sub">{subtitle}</span> : null}
        </span>
      </Link>
      {right ? <div className="soc-row-actions">{right}</div> : null}
    </div>
  )
}

export function RowSkeletons({ count = 5 }) {
  return (
    <div aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="soc-row" style={{ height: 64 }}>
          <div className="skeleton" style={{ width: 44, height: 44, borderRadius: '50%', flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <div className="skeleton" style={{ height: 12, width: '45%', marginBottom: 6 }} />
            <div className="skeleton" style={{ height: 9, width: '30%' }} />
          </div>
        </div>
      ))}
    </div>
  )
}
