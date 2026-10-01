import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { fetchGroupDetail, fetchGroupSummary, subscribeGroupMembers } from '../api'
import { isNotReady, v2Error } from '../errors'
import useLiveList from '../hooks/useLiveList'
import InviteCodeChip from './InviteCodeChip'
import LoadError from './LoadError'
import MemberTable from './MemberTable'

// Mounted by pages/BookingsPage.jsx inside each booking card. Renders nothing
// for a solo booking (no invite) or while the summary is loading; for a group
// booking it shows "Group · n of N joined" and expands to the invite code and
// the member list (live while open).
export default function GroupBookingPanel({ booking }) {
  const { t } = useTranslation(['v2', 'dashboard', 'common'])
  const [summary, setSummary] = useState(undefined) // undefined = loading, null = solo booking
  const [summaryError, setSummaryError] = useState(null)
  const [open, setOpen] = useState(false)

  const loadSummary = useCallback(() => {
    let cancelled = false
    setSummaryError(null)
    fetchGroupSummary(booking.id).then(({ data, error }) => {
      if (cancelled) return
      if (error) { setSummaryError(error); return }
      setSummary(data)
    })
    return () => { cancelled = true }
  }, [booking.id])

  // Reload when the booking row changes (status, party size) so the counts follow it.
  useEffect(() => loadSummary(), [loadSummary, booking.status, booking.party_size, booking.updated_at])

  const loadMembers = useCallback(() => fetchGroupDetail(booking.id), [booking.id])
  const subscribeMembers = useCallback(resync => subscribeGroupMembers(booking.id, resync), [booking.id])
  const detail = useLiveList(loadMembers, subscribeMembers, open ? booking.id : null)

  if (summaryError) {
    // Group tables not deployed yet: stay invisible rather than error on every card.
    if (isNotReady(summaryError)) return null
    return (
      <div className="v2-group">
        <LoadError message={t('panelLoadFailed')} onRetry={loadSummary} />
      </div>
    )
  }
  if (!summary) return null

  const list = detail.data ? detail.data.members : null
  const joined = list ? list.filter(m => m.status === 'joined' || m.status === 'arrived').length : summary.joined
  const arrived = list ? list.filter(m => m.status === 'arrived').length : 0
  const panelId = `v2-group-${booking.id}`

  return (
    <div className="v2-group">
      <button
        type="button"
        className="v2-group-toggle"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen(o => !o)}
      >
        <span aria-hidden="true">👥</span>
        <span>{t('groupSummary', { joined, total: summary.capacity })}</span>
        <span className="v2-group-chevron" aria-hidden="true">{open ? '▾' : '▸'}</span>
      </button>

      {open && (
        <div id={panelId} className="v2-group-body">
          <InviteCodeChip code={summary.code} />

          {detail.loading && !list ? (
            <div className="v2-skel-rows" aria-hidden="true">
              {[0, 1, 2].map(i => <div key={i} className="skeleton v2-skel-row" />)}
            </div>
          ) : !list ? (
            <LoadError message={v2Error(detail.error, t)} onRetry={detail.retry} />
          ) : list.length === 0 ? (
            <p className="v2-muted">{t('noMembers')}</p>
          ) : (
            <>
              <MemberTable members={list} />
              <div className="v2-group-foot">{t('arrivedCount', { arrived, total: summary.capacity })}</div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
