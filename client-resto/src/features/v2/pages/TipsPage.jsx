import { useCallback } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../../contexts/AuthContext'
import { fetchTipReport, subscribeTips } from '../api'
import { v2Error } from '../errors'
import { canOpenV2 } from '../roles'
import { buildTipsCsv, downloadCsv } from '../tipsCsv'
import useLiveList from '../hooks/useLiveList'
import useTipRange from '../hooks/useTipRange'
import EmptyBlock from '../components/EmptyBlock'
import LoadError from '../components/LoadError'
import Money from '../components/Money'
import TipDayStrip from '../components/TipDayStrip'
import TipRangeBar from '../components/TipRangeBar'
import WaiterTipsTable from '../components/WaiterTipsTable'
import '../styles.css'

// Manager view: what each waiter earned in tips over a range, plus the tips
// left for the whole team. Everything is summed server-side (tip_report).
export default function TipsPage() {
  const { restaurantId, staffRow } = useAuth()
  const { t } = useTranslation(['v2', 'common'])
  const rangeState = useTipRange('today')
  const { range, valid } = rangeState

  // The loaded report carries the range it was asked for, so the strip and the
  // CSV name never mix a new range with the previous range's numbers.
  const load = useCallback(async () => {
    const res = await fetchTipReport(restaurantId, range.from, range.to)
    return res.data ? { ...res, data: { ...res.data, range: { from: range.from, to: range.to } } } : res
  }, [restaurantId, range.from, range.to])
  const subscribe = useCallback(resync => subscribeTips(restaurantId, resync), [restaurantId])
  const key = valid && restaurantId ? `${restaurantId}|${range.from}|${range.to}` : null
  const { data, error, loading, retry } = useLiveList(load, subscribe, key)

  // The report lists every waiter even with 0 tips, so "empty" means no earned tips at all.
  const empty = !!data && data.count === 0
  const avg = data && data.count > 0 ? data.total / data.count : 0

  function handleExport() {
    if (!data) return
    const csv = buildTipsCsv(data, {
      waiter: t('colWaiter'), role: t('colRole'), tips: t('colTips'), total: t('colTotal'),
      average: t('colAvg'), lastTip: t('colLast'), unassigned: t('unassignedRow'),
      roleName: r => (r ? t(`role_${r}`, { defaultValue: r }) : ''),
    })
    downloadCsv(`tips_${data.range.from}_${data.range.to}.csv`, csv)
  }

  return (
    <div className="v2-page">
      <div className="v2-page-head">
        <div>
          <h1 className="page-title">{t('tipsTitle')}</h1>
          <p className="v2-page-sub">{t('tipsSub')}</p>
        </div>
        <div className="v2-page-actions">
          {canOpenV2(staffRow?.role, '/my-tips') && (
            <Link to="/my-tips" className="btn btn-ghost btn-sm">{t('navMyTips')}</Link>
          )}
          <button type="button" className="btn btn-ghost btn-sm" onClick={handleExport} disabled={!data || empty}>
            {t('exportCsv')}
          </button>
        </div>
      </div>

      <TipRangeBar state={rangeState} />

      {!valid ? null : loading ? (
        <div aria-hidden="true">
          <div className="v2-stats v2-stats--4">
            {[0, 1, 2, 3].map(i => <div key={i} className="skeleton v2-skel-stat" />)}
          </div>
          {[0, 1, 2].map(i => <div key={i} className="skeleton v2-skel-row" />)}
        </div>
      ) : !data ? (
        <LoadError message={v2Error(error, t)} onRetry={retry} />
      ) : (
        <>
          <div className="v2-stats v2-stats--4">
            <div className="stat-card v2-stat v2-stat--accent">
              <div className="stat-value"><Money value={data.total} /></div>
              <div className="stat-label">{t('statTipsTotal')}</div>
            </div>
            <div className="stat-card v2-stat v2-stat--blue">
              <div className="stat-value">{data.count}</div>
              <div className="stat-label">{t('statTipsCount')}</div>
            </div>
            <div className="stat-card v2-stat v2-stat--green">
              <div className="stat-value"><Money value={avg} /></div>
              <div className="stat-label">{t('statTipsAvg')}</div>
            </div>
            <div className="stat-card v2-stat v2-stat--gold">
              <div className="stat-value"><Money value={data.unassigned.total} /></div>
              <div className="stat-label">{t('statUnassigned')}</div>
              <div className="stat-sub">{t('tipCount', { count: data.unassigned.count })}</div>
            </div>
          </div>

          {empty ? (
            <EmptyBlock icon="🪙" title={t('noTips')} body={t('noTipsHint')} />
          ) : (
            <>
              <TipDayStrip days={data.byDay} from={data.range.from} to={data.range.to} />
              <section className="v2-tips-section" aria-labelledby="v2-tips-by-waiter">
                <h2 id="v2-tips-by-waiter" className="dash-section-title">{t('byWaiterTitle')}</h2>
                <WaiterTipsTable waiters={data.waiters} unassigned={data.unassigned} />
              </section>
            </>
          )}
        </>
      )}
    </div>
  )
}
