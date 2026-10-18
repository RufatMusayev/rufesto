import { useTranslation } from 'react-i18next'
import LanguageSwitcher from '../../../components/LanguageSwitcher'
import { useAuth } from '../../../contexts/AuthContext'
import { useTheme } from '../../../contexts/ThemeContext'
import { useSheetNavigate } from '../../../components/ui/BottomSheet'
import { GlobeIcon, MoonIcon, BellIcon, ForkKnifeIcon, ChevronIcon } from './Icons'

/** A row that leaves the page from inside a sheet: it replaces the sheet's history entry (Back returns to Profile). */
function GoRow({ to, icon, label }) {
  const go = useSheetNavigate()
  return (
    <a href={to} className="pf-set-row pf-set-link row-pressable" onClick={e => { e.preventDefault(); go(to) }}>
      <span className="pf-set-icon">{icon}</span>
      <span className="pf-set-label">{label}</span>
      <ChevronIcon size={16} />
    </a>
  )
}

/**
 * The rows of Settings, shared by the Settings sheet (signed in) and the guest profile page (signed out):
 * Language, Dark mode, Notifications (signed in only: it needs an account), Send feedback.
 * The only home of AZ | EN | RU and the theme (docs/UX-PLAN-2026-10-18.md D10).
 */
export default function SettingsRows({ onFeedback, inSheet = false }) {
  const { t } = useTranslation(['profile', 'nav'])
  const { session } = useAuth()
  const { theme, toggle } = useTheme()
  const dark = theme === 'dark'
  return (
    <div className="pf-set-list">
      <div className="pf-set-row">
        <span className="pf-set-icon"><GlobeIcon size={20} /></span>
        <span className="pf-set-label">{t('profile:language')}</span>
        <LanguageSwitcher />
      </div>

      <div className="pf-set-row">
        <span className="pf-set-icon"><MoonIcon size={20} /></span>
        <span className="pf-set-label" id="pf-theme-label">{t('profile:darkMode')}</span>
        <button
          type="button" role="switch" aria-checked={dark} aria-labelledby="pf-theme-label"
          className={`pf-switch${dark ? ' on' : ''}`} onClick={toggle}
        >
          <span className="pf-switch-knob" aria-hidden="true" />
        </button>
      </div>

      {session && inSheet ? (
        <GoRow to="/settings/notifications" icon={<BellIcon size={20} />} label={t('nav:notifications')} />
      ) : null}

      <button type="button" className="pf-set-row pf-set-link row-pressable" onClick={onFeedback}>
        <span className="pf-set-icon"><ForkKnifeIcon size={20} /></span>
        <span className="pf-set-label">{t('profile:feedbackRow')}</span>
        <ChevronIcon size={16} />
      </button>
    </div>
  )
}
