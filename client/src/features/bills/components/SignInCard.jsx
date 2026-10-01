import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import AuthModal from '../../../components/AuthModal'

/** Signed-out state: a card with a sign-in button that opens AuthModal. Never a blank page. */
export default function SignInCard() {
  const { t } = useTranslation('bills')
  const [open, setOpen] = useState(false)
  return (
    <>
      <div className="card bl-signin">
        <div className="bl-signin-icon" aria-hidden="true">🧾</div>
        <div className="bl-signin-title">{t('signInTitle')}</div>
        <p className="bl-signin-body">{t('signInBody')}</p>
        <button type="button" className="btn btn-primary" onClick={() => setOpen(true)}>
          {t('signInButton')}
        </button>
      </div>
      {open && <AuthModal onClose={() => setOpen(false)} onSuccess={() => setOpen(false)} />}
    </>
  )
}
