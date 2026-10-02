import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { fetchStaffList } from '../api'
import { v2Error } from '../errors'
import useLiveList from '../hooks/useLiveList'
import EmptyBlock from './EmptyBlock'
import LoadError from './LoadError'
import StatusPill, { ROLE_TONE } from './StatusPill'

// Settings -> Staff: read-only team list plus a disabled invite card. Nothing
// here writes; inviting staff is a later release.
export default function StaffList({ restaurantId }) {
  const { t } = useTranslation('v2')
  const load = useCallback(() => fetchStaffList(restaurantId), [restaurantId])
  const { data, error, loading, retry } = useLiveList(load, null, restaurantId)

  return (
    <div className="v2-stack">
      <section className="v2-card" aria-labelledby="v2-staff-title">
        <h2 id="v2-staff-title" className="dash-section-title">{t('staffTitle')}</h2>
        <p className="v2-hint">{t('staffReadOnly')}</p>

        {loading ? (
          <div aria-hidden="true">
            {[0, 1, 2].map(i => <div key={i} className="skeleton v2-skel-row" />)}
          </div>
        ) : !data ? (
          <LoadError message={v2Error(error, t)} onRetry={retry} />
        ) : data.length === 0 ? (
          <EmptyBlock icon="👥" title={t('staffEmpty')} />
        ) : (
          <ul className="v2-staff">
            {data.map(s => {
              const name = s.name || t('staffUnnamed')
              return (
                <li key={s.id} className="v2-staff-row">
                  <span className="v2-avatar" aria-hidden="true">{name[0].toUpperCase()}</span>
                  <span className="v2-staff-name">{name}</span>
                  <StatusPill tone={ROLE_TONE[s.role] || 'gray'}>{t(`role_${s.role}`, { defaultValue: s.role })}</StatusPill>
                  <StatusPill tone={s.active ? 'green' : 'gray'}>{s.active ? t('staffActive') : t('staffInactive')}</StatusPill>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <section className="v2-invite-card" aria-labelledby="v2-invite-title">
        <div className="v2-invite-card-icon" aria-hidden="true">🔒</div>
        <div className="v2-invite-card-text">
          <h2 id="v2-invite-title" className="v2-invite-card-title">{t('staffInvite')}</h2>
          <p className="v2-hint">{t('staffInviteSoon')}</p>
        </div>
        <button type="button" className="btn btn-ghost" disabled>{t('staffInvite')}</button>
      </section>
    </div>
  )
}
