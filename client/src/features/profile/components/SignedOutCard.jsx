import { useTranslation } from 'react-i18next'
import SettingsRows from './SettingsRows'

/**
 * The guest profile (signed out): the page bar, the sign-in card on top, then Settings (Language, Dark mode, Share
 * feedback) inline. The Profile tab always opens this page, so a visitor can switch language and theme without an account.
 */
export default function SignedOutCard({ onSignIn, onFeedback }) {
  const { t } = useTranslation(['auth', 'profile', 'nav'])
  return (
    <>
      <div className="pf-bar">
        <h1 className="pf-bar-title">{t('nav:profile')}</h1>
      </div>
      <section className="card pf-signedout">
        <div className="pf-signedout-icon" aria-hidden="true">🍽️</div>
        <h2 className="pf-signedout-title">{t('auth:welcomeToRufesto')}</h2>
        <p className="pf-signedout-body">{t('auth:signInPrompt')}</p>
        <button type="button" className="btn btn-primary pf-signedout-cta" onClick={onSignIn}>
          {t('auth:signIn')}
        </button>
      </section>
      <section className="pf-guest-settings" aria-labelledby="pf-guest-set-title">
        <h2 id="pf-guest-set-title" className="pf-sec">{t('profile:settings')}</h2>
        <SettingsRows onFeedback={onFeedback} />
      </section>
    </>
  )
}
