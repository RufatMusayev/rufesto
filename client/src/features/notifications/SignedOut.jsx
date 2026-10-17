import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import AuthModal from '../../components/AuthModal'
import { BellIcon } from './Icons'
import './styles.css'

/** The signed-out card shared by the inbox and its settings: what this is, and a sign-in button. */
export default function SignedOut({ title }) {
  const { t } = useTranslation(['notifications', 'auth'])
  const [showAuth, setShowAuth] = useState(false)
  return (
    <div className="ntf-page">
      <div className="ntf-signin">
        <span className="ntf-signin-icon"><BellIcon size={28} /></span>
        <h1 className="ntf-signin-title">{title || t('notifications:title')}</h1>
        <p>{t('auth:notificationsSignInPrompt')}</p>
        <button type="button" className="btn btn-primary" onClick={() => setShowAuth(true)}>{t('auth:signIn')}</button>
      </div>
      {showAuth && <AuthModal onClose={() => setShowAuth(false)} />}
    </div>
  )
}
