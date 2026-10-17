import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { BellIcon } from './Icons'

/** Placeholder rows shaped like the real ones (44 px circle, two text lines, 64 px high): nothing moves when the rows arrive. */
export function InboxSkeleton() {
  return (
    <ul className="ntf-list" aria-busy="true" aria-live="polite">
      {[0, 1, 2, 3, 4, 5].map(i => (
        <li key={i} className="ntf-sk">
          <span className="skeleton ntf-sk-av" />
          <span className="ntf-sk-lines">
            <span className="skeleton ntf-sk-l1" />
            <span className="skeleton ntf-sk-l2" />
          </span>
        </li>
      ))}
    </ul>
  )
}

/** Signed in, nothing yet (docs/UX-PLAN-2026-10-18.md 2.2): a bell in a circle, what will show up here, and the way to make it happen. */
export function EmptyInbox() {
  const { t } = useTranslation('notifications')
  return (
    <div className="ntf-empty">
      <span className="ntf-empty-icon"><BellIcon size={28} /></span>
      <h2 className="ntf-empty-title">{t('emptyTitle')}</h2>
      <p className="ntf-empty-body">{t('emptyBody')}</p>
      <Link to="/friends?tab=find" className="btn btn-ghost">{t('emptyFind')}</Link>
    </div>
  )
}
