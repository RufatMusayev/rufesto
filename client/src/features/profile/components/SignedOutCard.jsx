import { useTranslation } from 'react-i18next'
import { GearIcon } from './Icons'

/**
 * Signed-out Profile: the page bar with the settings gear (language and theme live there, so a guest needs it), a friendly
 * card with the sign-in button, and the feedback form still one tap away.
 */
export default function SignedOutCard({ onSignIn, onFeedback, onSettings }) {
  const { t } = useTranslation(['auth', 'profile', 'nav'])
  return (
    <>
      <div className="pf-bar">
        <h1 className="pf-bar-title">{t('nav:profile')}</h1>
        <button type="button" className="icon-btn pf-gear" onClick={onSettings} aria-label={t('profile:settings')}>
          <GearIcon size={22} />
        </button>
      </div>
      <section className="card pf-signedout">
        <div className="pf-signedout-icon" aria-hidden="true">🍽️</div>
        <h2 className="pf-signedout-title">{t('auth:welcomeToRufesto')}</h2>
        <p className="pf-signedout-body">{t('auth:signInPrompt')}</p>
        <button type="button" className="btn btn-primary pf-signedout-cta" onClick={onSignIn}>
          {t('auth:signIn')}
        </button>
        <button type="button" className="pf-link-btn" onClick={onFeedback}>
          {t('profile:shareFeedback')}
        </button>
      </section>
    </>
  )
}
