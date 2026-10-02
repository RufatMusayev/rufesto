import { useTranslation } from 'react-i18next'
import { localeTag } from '../../../lib/time'
import { bakuWhen } from '../dates'
import Money from './Money'
import StatusPill, { ROLE_TONE } from './StatusPill'

// Per-waiter tips, biggest total first (api.js sorts). A real table on wide
// screens; on phones every row becomes a card (labels come from data-label).
// Tips left for the whole team have no waiter and close the list as a muted row.
export default function WaiterTipsTable({ waiters, unassigned }) {
  const { t, i18n } = useTranslation('v2')
  const tag = localeTag(i18n.language)
  const showUnassigned = unassigned.count > 0 || unassigned.total > 0

  const cells = (count, total, avg, last) => (
    <>
      <td className="v2-tips-num" data-label={t('colTips')}>{count}</td>
      <td className="v2-tips-num" data-label={t('colTotal')}><Money value={total} strong /></td>
      <td className="v2-tips-num" data-label={t('colAvg')}><Money value={avg} tone="muted" /></td>
      <td className="v2-tips-last" data-label={t('colLast')}>{last || '—'}</td>
    </>
  )

  return (
    <div className="v2-tips-wrap">
      <table className="v2-tips-table">
        <thead>
          <tr>
            <th scope="col">{t('colWaiter')}</th>
            <th scope="col">{t('colRole')}</th>
            <th scope="col" className="v2-tips-num">{t('colTips')}</th>
            <th scope="col" className="v2-tips-num">{t('colTotal')}</th>
            <th scope="col" className="v2-tips-num">{t('colAvg')}</th>
            <th scope="col">{t('colLast')}</th>
          </tr>
        </thead>
        <tbody>
          {waiters.map(w => (
            <tr key={w.staffId}>
              <th scope="row" className="v2-tips-name">{w.name || t('staffUnnamed')}</th>
              <td className="v2-tips-role">
                {w.role && <StatusPill tone={ROLE_TONE[w.role] || 'gray'}>{t(`role_${w.role}`, { defaultValue: w.role })}</StatusPill>}
              </td>
              {cells(w.count, w.total, w.avg, bakuWhen(w.lastTipAt, tag))}
            </tr>
          ))}
          {showUnassigned && (
            <tr className="v2-tips-row--team">
              <th scope="row" className="v2-tips-name">{t('unassignedRow')}</th>
              <td className="v2-tips-role" />
              {cells(unassigned.count, unassigned.total, unassigned.count > 0 ? unassigned.total / unassigned.count : 0, '')}
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
