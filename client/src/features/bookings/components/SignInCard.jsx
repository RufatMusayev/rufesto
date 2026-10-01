import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import AuthModal from '../../../components/AuthModal'

/** Signed-out state: a card with a sign-in button that opens AuthModal. Never a blank page. */
export default function SignInCard({ title, body }) {
  const { t } = useTranslation('bookings')
  const [open, setOpen] = useState(false)
  return (
    <>
      <div className="card bk-signin">
        <div className="bk-signin-icon" aria-hidden="true">🍽️</div>
        <div>
          <div className="bk-signin-title">{title || t('signIn.title')}</div>
          <p className="bk-signin-body">{body || t('signIn.body')}</p>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => setOpen(true)}>
          {t('signIn.button')}
        </button>
      </div>
      {open && <AuthModal onClose={() => setOpen(false)} onSuccess={() => setOpen(false)} />}
    </>
  )
}
