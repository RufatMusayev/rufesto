import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import AuthModal from '../../../components/AuthModal'

/** Signed-out state: a card with a sign-in button that opens AuthModal. Never a blank page. */
export default function SignInCard({ title, body, compact = false }) {
  const { t } = useTranslation('social')
  const [open, setOpen] = useState(false)
  return (
    <>
      <div className={`card soc-signin${compact ? ' soc-signin-compact' : ''}`}>
        <div className="soc-signin-icon" aria-hidden="true">🍽️</div>
        <div className="soc-signin-text">
          <div className="soc-signin-title">{title || t('signIn.title')}</div>
          <p className="soc-signin-body">{body || t('signIn.body')}</p>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => setOpen(true)}>
          {t('signIn.button')}
        </button>
      </div>
      {open && <AuthModal onClose={() => setOpen(false)} onSuccess={() => setOpen(false)} />}
    </>
  )
}
