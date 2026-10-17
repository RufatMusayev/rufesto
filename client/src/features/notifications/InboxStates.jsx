import { useTranslation } from 'react-i18next'
import { EmptyState } from '../../components/ui'

/** Placeholder rows shaped like the real ones (avatar, two text lines). */
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

const EMPTY = {
  all:      { icon: '✓',  title: 'allCaughtUp',        body: 'allCaughtUpHint' },
  social:   { icon: '🤌', title: 'emptySocialTitle',   body: 'emptySocialBody' },
  dinein:   { icon: '🍽️', title: 'emptyDineinTitle',   body: 'emptyDineinBody' },
  bookings: { icon: '📋', title: 'emptyBookingsTitle', body: 'emptyBookingsBody' },
  places:   { icon: '📍', title: 'emptyPlacesTitle',   body: 'emptyPlacesBody' },
}

/** The "nothing here" block for the current filter. */
export function EmptyInbox({ category }) {
  const { t } = useTranslation('notifications')
  const e = EMPTY[category || 'all']
  return <EmptyState icon={e.icon} title={t(e.title)} body={t(e.body)} />
}
