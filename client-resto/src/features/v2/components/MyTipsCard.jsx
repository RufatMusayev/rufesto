import { useCallback } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../../contexts/AuthContext'
import { fetchMyTips, subscribeTips } from '../api'
import { bakuDateString } from '../dates'
import { isNotReady, v2Error } from '../errors'
import useLiveList from '../hooks/useLiveList'
import { canOpenV2 } from '../roles'
import Money from './Money'

// Compact "My tips today" card for the top of the Waiter page; links to /my-tips.
// Renders nothing for roles without that page, and while the tips backend isn't
// deployed (the waiter screen must not show an error for a missing feature).
export default function MyTipsCard() {
  const { restaurantId, staffRow } = useAuth()
  const { t } = useTranslation('v2')
  const allowed = canOpenV2(staffRow?.role, '/my-tips')
  const today = bakuDateString()
  const load = useCallback(() => fetchMyTips(today, today), [today])
  const subscribe = useCallback(resync => subscribeTips(restaurantId, resync), [restaurantId])
  const { data, error, loading, retry } = useLiveList(load, subscribe, allowed && restaurantId ? `${restaurantId}|${today}` : null)

  if (!allowed) return null
  if (loading) return <div className="skeleton v2-skel-mytips" aria-hidden="true" />
  if (!data) {
    if (isNotReady(error)) return null
    return (
      <div className="v2-mytips v2-mytips--error" role="alert">
        <span>{v2Error(error, t)}</span>
        <button type="button" className="btn btn-ghost btn-sm" onClick={retry}>{t('retry')}</button>
      </div>
    )
  }

  return (
    <Link to="/my-tips" className="v2-mytips">
      <div className="v2-mytips-body">
        <span className="dash-section-title">{t('myTipsCardTitle')}</span>
        <span className="v2-mytips-figures">
          <Money value={data.total} strong />
          <span className="v2-muted">{t('tipCount', { count: data.count })}</span>
        </span>
      </div>
      <span className="v2-mytips-go">{t('myTipsCardLink')} <span aria-hidden="true">→</span></span>
    </Link>
  )
}
