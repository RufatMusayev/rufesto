import { useTranslation } from 'react-i18next'
import { SUPPORTED_LANGS } from '../lib/i18n'

const LANG_LABELS = { az: 'AZ', en: 'EN', ru: 'RU' }
// Each language is named in itself, for screen readers and the tooltip.
const LANG_NAMES = { az: 'Azərbaycanca', en: 'English', ru: 'Русский' }

// AZ / EN / RU buttons. Styles: .lang-switcher / .lang-btn in index.css (a full touch target on phones; the narrow
// tablet rail stacks them in a column). The choice is saved by the language detector under 'rufesto_lang'.
export default function LanguageSwitcher({ className = '' }) {
  const { t, i18n } = useTranslation('dashboard')
  const current = (i18n.resolvedLanguage || i18n.language || 'en').slice(0, 2)

  return (
    <div className={`lang-switcher ${className}`} role="group" aria-label={t('navLanguage')}>
      {SUPPORTED_LANGS.map(lang => (
        <button
          key={lang}
          type="button"
          className={`lang-btn${current === lang ? ' active' : ''}`}
          aria-pressed={current === lang}
          lang={lang}
          title={LANG_NAMES[lang]}
          aria-label={LANG_NAMES[lang]}
          onClick={() => i18n.changeLanguage(lang)}
        >
          {LANG_LABELS[lang]}
        </button>
      ))}
    </div>
  )
}
