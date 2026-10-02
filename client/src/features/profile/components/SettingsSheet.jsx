import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Sheet } from '../../../components/ui'
import LanguageSwitcher from '../../../components/LanguageSwitcher'
import { useAuth } from '../../../contexts/AuthContext'
import { useTheme } from '../../../contexts/ThemeContext'
import {
  GlobeIcon, MoonIcon, BellIcon, ForkKnifeIcon, SignOutIcon, TrashIcon, ChevronIcon,
} from './Icons'

/** Language, theme, notifications, feedback, sign out, and the "contact support" note for deleting an account. */
export default function SettingsSheet({ open, onClose, onFeedback }) {
  const { t } = useTranslation(['profile', 'nav'])
  const { signOut } = useAuth()
  const { theme, toggle } = useTheme()
  const [deleteOpen, setDeleteOpen] = useState(false)
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
          <span className="pf-set-label" id="pf-theme-label">{dark ? t('profile:darkMode') : t('profile:lightMode')}</span>
          <button
            type="button" role="switch" aria-checked={dark} aria-labelledby="pf-theme-label"
            className={`pf-switch${dark ? ' on' : ''}`} onClick={toggle}
          >
            <span className="pf-switch-knob" aria-hidden="true" />
          </button>
        </div>

        <Link to="/notifications" className="pf-set-row pf-set-link" onClick={onClose}>
          <span className="pf-set-icon"><BellIcon size={20} /></span>
          <span className="pf-set-label">{t('nav:notifications')}</span>
          <ChevronIcon size={16} />
        </Link>

        <button type="button" className="pf-set-row pf-set-link" onClick={onFeedback}>
          <span className="pf-set-icon"><ForkKnifeIcon size={20} /></span>
          <span className="pf-set-label">{t('profile:feedbackRow')}</span>
          <ChevronIcon size={16} />
        </button>

        <button
          type="button" className="pf-set-row pf-set-link pf-set-danger"
          aria-expanded={deleteOpen} aria-controls="pf-delete-note" onClick={() => setDeleteOpen(v => !v)}
        >
          <span className="pf-set-icon"><TrashIcon size={20} /></span>
          <span className="pf-set-label">{t('profile:deleteAccount')}</span>
          <ChevronIcon size={16} />
        </button>
        {deleteOpen ? (
          <div id="pf-delete-note" className="pf-delete-note" role="note">
            <p>{t('profile:deleteNote')}</p>
            <button type="button" className="btn btn-ghost" onClick={onFeedback}>{t('profile:contactSupport')}</button>
          </div>
        ) : null}
      </div>

      <button type="button" className="btn btn-danger pf-block pf-signout" onClick={handleSignOut} disabled={signingOut}>
        <SignOutIcon size={18} />
        <span>{t('profile:signOut')}</span>
      </button>
    </Sheet>
  )
}
