import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { formatPrice, timeAgo } from '@shared/helpers'
import { useAuth } from '../../contexts/AuthContext'
import { canAccess } from '../../lib/roles'
import { requestKindIcon, requestKindLabelKey, isUrgent } from './waiterHelpers'

// Ticks every 15s so call age ("3m ago") and the 3-minute urgent style stay
// live without a full waiter_overview refetch.
function useNow(intervalMs = 15000) {
  const [now, setNow] = useState(Date.now())
  const ref = useRef()
  useEffect(() => {
    ref.current = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(ref.current)
  }, [intervalMs])
  return now
}

export default function CallsTab({ calls, acting, onAck, onResolve }) {
  const { t } = useTranslation(['dashboard', 'common'])
  const now = useNow()

  if (calls.length === 0) {
    return <div className="empty"><div className="empty-icon">🙌</div>{t('dashboard:waiterNoCalls')}</div>
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      {calls.map(call => (
        <CallCard key={call.id} call={call} now={now}
          acting={acting === call.id} onAck={onAck} onResolve={onResolve} />
      ))}
    </div>
  )
}

function CallCard({ call, now, acting, onAck, onResolve }) {
  const { t, i18n } = useTranslation(['dashboard', 'common'])
  const { staffRow } = useAuth()
  const urgent = call.kind !== 'bill' && call.status === 'open' && isUrgent(call.createdAt, now)

  return (
    <div style={{
      background: 'var(--s2)', borderRadius: 14, overflow: 'hidden',
      border: urgent ? '1.5px solid var(--red)' : '1px solid var(--border)',
      boxShadow: urgent ? '0 0 0 1px rgba(163,45,45,0.2)' : 'none',
    }}>
      <div style={{ padding: '0.75rem 1rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <div style={{
          width: 38, height: 38, borderRadius: 10,
          background: 'var(--s3)', border: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '1.1rem', flexShrink: 0,
        }}>
          {call.kind === 'bill' ? '💳' : requestKindIcon(call.kind)}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 700, fontSize: '0.85rem' }}>
              {t('dashboard:tableLabel', { number: call.tableNumber })}
            </span>
            {call.section && <span style={{ fontSize: '0.68rem', color: 'var(--t3)' }}>· {call.section}</span>}
          </div>
          <div style={{ fontSize: '0.78rem', color: 'var(--t2)', marginTop: 2 }}>
            {call.kind === 'bill'
              ? t('dashboard:waiterBillRequested', { amount: formatPrice(call.outstanding) })
              : t(`dashboard:${requestKindLabelKey(call.kind)}`)}
          </div>
          <div style={{ fontSize: '0.68rem', marginTop: 2, color: urgent ? 'var(--red)' : 'var(--t3)', fontWeight: urgent ? 700 : 400 }}>
            {call.createdAt ? timeAgo(call.createdAt, i18n.language) : ''}
            {call.assignedName ? ` · ${call.assignedName}` : ''}
          </div>
        </div>

        {/* Bill requests are settled on the Bills page (admin, manager, cashier). */}
        {call.kind === 'bill' && canAccess(staffRow?.role, '/bills') && (
          <Link to={`/bills?table=${encodeURIComponent(call.tableId)}`} className="btn btn-ghost btn-sm" style={{ flexShrink: 0 }}>
            {t('v2:navBills')}
          </Link>
        )}

        {call.kind !== 'bill' && (
          <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
            {call.status === 'open' && (
              <button className="btn btn-ghost btn-sm" disabled={acting} onClick={() => onAck(call.id)}>
                {acting ? <span className="spinner" style={{ width: 12, height: 12 }} /> : t('dashboard:waiterOnMyWay')}
              </button>
            )}
            <button className="btn btn-primary btn-sm" disabled={acting} onClick={() => onResolve(call.id)}>
              {acting ? <span className="spinner" style={{ width: 12, height: 12 }} /> : t('common:done')}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
