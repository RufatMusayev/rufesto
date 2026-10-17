import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Sheet } from '../../../components/ui'
import LanguageSwitcher from '../../../components/LanguageSwitcher'
import { useAuth } from '../../../contexts/AuthContext'
import { useTheme } from '../../../contexts/ThemeContext'
import { useSheetNavigate } from '../../../components/ui/BottomSheet'
import {
  GlobeIcon, MoonIcon, BellIcon, ForkKnifeIcon, SignOutIcon, ChevronIcon,
} from './Icons'

/** A row that leaves the page: it replaces the sheet's history entry (Back returns to Profile, not to a closed sheet). */
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
 * Language, dark mode, notification settings, feedback and sign out. The only home of the EN | AZ and theme controls
 * (they left the top bar and the rail, docs/UX-PLAN-2026-10-18.md D10), so a signed-out guest gets this sheet too, with the
 * rows that need no account. Deleting the account lives at the bottom of Edit profile.
 */
export default function SettingsSheet({ open, onClose, onFeedback }) {
  const { t } = useTranslation(['profile', 'nav', 'notifications'])
  const { session, signOut } = useAuth()
  const { theme, toggle } = useTheme()
  const [signingOut, setSigningOut] = useState(false)
  const dark = theme === 'dark'

  async function handleSignOut() {
    if (signingOut) return
    setSigningOut(true)
    try { await signOut() } finally { setSigningOut(false); onClose() }
  }

  return (
    <Sheet open={open} onClose={onClose} title={t('profile:settings')}>
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

        {session ? (
          <GoRow to="/settings/notifications" icon={<BellIcon size={20} />} label={t('nav:notifications')} />
        ) : null}

        <button type="button" className="pf-set-row pf-set-link row-pressable" onClick={onFeedback}>
          <span className="pf-set-icon"><ForkKnifeIcon size={20} /></span>
          <span className="pf-set-label">{t('profile:feedbackRow')}</span>
          <ChevronIcon size={16} />
        </button>
      </div>

      {session ? (
        <button type="button" className="btn btn-danger pf-block pf-signout" onClick={handleSignOut} disabled={signingOut}>
          <SignOutIcon size={18} />
          <span>{t('profile:signOut')}</span>
        </button>
      ) : null}
    </Sheet>
  )
}
