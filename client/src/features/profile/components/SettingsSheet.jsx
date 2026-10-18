import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Sheet } from '../../../components/ui'
import { useAuth } from '../../../contexts/AuthContext'
import SettingsRows from './SettingsRows'
import { SignOutIcon } from './Icons'

/**
 * Settings for a signed-in guest: Language, Dark mode, Notifications, Send feedback, and Sign out. A signed-out guest
 * gets the same rows inline on the Profile page (SettingsRows). Deleting the account lives at the bottom of Edit profile.
 */
export default function SettingsSheet({ open, onClose, onFeedback }) {
  const { t } = useTranslation('profile')
  const { signOut } = useAuth()
  const [signingOut, setSigningOut] = useState(false)

  async function handleSignOut() {
    if (signingOut) return
    setSigningOut(true)
    try { await signOut() } finally { setSigningOut(false); onClose() }
  }

  return (
    <Sheet open={open} onClose={onClose} title={t('settings')}>
      <SettingsRows inSheet onFeedback={onFeedback} />

      <button type="button" className="btn btn-danger pf-block pf-signout" onClick={handleSignOut} disabled={signingOut}>
        <SignOutIcon size={18} />
        <span>{t('signOut')}</span>
      </button>
    </Sheet>
  )
}
