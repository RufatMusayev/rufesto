import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../../contexts/AuthContext'
import BookingRulesForm from '../components/BookingRulesForm'
import HoursEditor from '../components/HoursEditor'
import StaffList from '../components/StaffList'
import '../styles.css'

const TABS = ['hours', 'rules', 'staff']
const TAB_LABEL = { hours: 'tabHours', rules: 'tabRules', staff: 'tabStaff' }

// /settings?tab=hours|rules|staff. Each tab loads and saves on its own; a
// "Saved" toast confirms a write for two seconds.
export default function SettingsPage() {
  const { restaurantId } = useAuth()
  const { t } = useTranslation('v2')
  const [params, setParams] = useSearchParams()
  const requested = params.get('tab')
  const tab = TABS.includes(requested) ? requested : 'hours'

  const [saved, setSaved] = useState(false)
  const timer = useRef(null)
  useEffect(() => () => clearTimeout(timer.current), [])
  const flashSaved = useCallback(() => {
    setSaved(true)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setSaved(false), 2000)
  }, [])

  return (
    <div className="v2-page">
      <div className="v2-page-head">
        <h1 className="page-title">{t('settingsTitle')}</h1>
      </div>

      <div className="v2-chips no-scrollbar" role="tablist" aria-label={t('settingsTitle')}>
        {TABS.map(id => (
          <button
            key={id}
            id={`v2-tab-${id}`}
            type="button"
            role="tab"
            aria-selected={tab === id}
            aria-controls="v2-tabpanel"
            className={`chip${tab === id ? ' active' : ''}`}
            onClick={() => setParams({ tab: id }, { replace: true })}
          >
            {t(TAB_LABEL[id])}
          </button>
        ))}
      </div>

      <div id="v2-tabpanel" role="tabpanel" aria-labelledby={`v2-tab-${tab}`} className="v2-tabpanel">
        {tab === 'hours' && <HoursEditor restaurantId={restaurantId} onSaved={flashSaved} />}
        {tab === 'rules' && <BookingRulesForm restaurantId={restaurantId} onSaved={flashSaved} />}
        {tab === 'staff' && <StaffList restaurantId={restaurantId} />}
      </div>

      <div className={`v2-toast${saved ? ' is-visible' : ''}`} role="status" aria-live="polite">
        {saved ? t('saved') : ''}
      </div>
    </div>
  )
}
