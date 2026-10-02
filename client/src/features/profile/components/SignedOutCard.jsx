import { useTranslation } from 'react-i18next'

/** Signed-out Profile: a friendly card with the sign-in button, and the feedback form still one tap away. */
export default function SignedOutCard({ onSignIn, onFeedback }) {
  const { t } = useTranslation(['auth', 'profile'])
  return (
    <section className="card pf-signedout">
      <div className="pf-signedout-icon" aria-hidden="true">🍽️</div>
      <h1 className="pf-signedout-title">{t('auth:welcomeToRufesto')}</h1>
      <p className="pf-signedout-body">{t('auth:signInPrompt')}</p>
      <button type="button" className="btn btn-primary pf-signedout-cta" onClick={onSignIn}>
        {t('auth:signIn')}
      </button>
      <button type="button" className="pf-link-btn" onClick={onFeedback}>
        {t('profile:shareFeedback')}
      </button>
    </section>
  )
}
