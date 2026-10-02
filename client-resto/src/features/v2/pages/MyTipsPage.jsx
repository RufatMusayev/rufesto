import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../../contexts/AuthContext'
import { fetchMyTips, subscribeTips } from '../api'
import { v2Error } from '../errors'
import useLiveList from '../hooks/useLiveList'
import useTipRange from '../hooks/useTipRange'
import EmptyBlock from '../components/EmptyBlock'
import LoadError from '../components/LoadError'
import Money from '../components/Money'
import MyTipsList from '../components/MyTipsList'
import TipDayStrip from '../components/TipDayStrip'
import TipRangeBar from '../components/TipRangeBar'
import '../styles.css'

// Floor staff view: only the tips the signed-in account earned (my_tips), never
// the table's or the restaurant's totals.
export default function MyTipsPage() {
  const { restaurantId } = useAuth()
  const { t } = useTranslation('v2')
  const rangeState = useTipRange('today')
  const { range, valid } = rangeState

  // The loaded data carries its own range (see TipsPage).
  const load = useCallback(async () => {
    const res = await fetchMyTips(range.from, range.to)
    return res.data ? { ...res, data: { ...res.data, range: { from: range.from, to: range.to } } } : res
  }, [range.from, range.to])
  const subscribe = useCallback(resync => subscribeTips(restaurantId, resync), [restaurantId])
  const key = valid && restaurantId ? `${restaurantId}|${range.from}|${range.to}` : null
  const { data, error, loading, retry } = useLiveList(load, subscribe, key)

  const empty = !!data && data.count === 0 && data.tips.length === 0

  return (
    <div className="v2-page">
      <div className="v2-page-head">
        <div>
          <h1 className="page-title">{t('myTipsTitle')}</h1>
          <p className="v2-page-sub">{t('myTipsSub')}</p>
        </div>
      </div>

      <TipRangeBar state={rangeState} />

      {!valid ? null : loading ? (
        <div aria-hidden="true">
          <div className="skeleton v2-skel-hero" />
          {[0, 1, 2].map(i => <div key={i} className="skeleton v2-skel-row" />)}
        </div>
      ) : !data ? (
        <LoadError message={v2Error(error, t)} onRetry={retry} />
      ) : (
        <>
          <section className="stat-card v2-stat--accent v2-tips-hero" aria-label={t('statTipsTotal')}>
            <div className="stat-label">{t('statTipsTotal')}</div>
            <div className="v2-tips-hero-value"><Money value={data.total} /></div>
            <div className="stat-sub">{t('tipCount', { count: data.count })}</div>
          </section>

          {empty ? (
            <EmptyBlock icon="🪙" title={t('noTips')} body={t('noTipsMineHint')} />
          ) : (
            <>
              <TipDayStrip days={data.byDay} from={data.range.from} to={data.range.to} />
              <section className="v2-tips-section" aria-labelledby="v2-my-tips-list">
                <h2 id="v2-my-tips-list" className="dash-section-title">{t('tipListTitle')}</h2>
                <MyTipsList tips={data.tips} withDate={data.range.from !== data.range.to} />
              </section>
            </>
          )}
        </>
      )}
    </div>
  )
}
