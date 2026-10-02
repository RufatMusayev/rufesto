import { useTranslation } from 'react-i18next'
import { SUPPORTED_LANGS } from '../lib/i18n'

const LANG_LABELS = { en: 'EN', az: 'AZ' }

export default function LanguageSwitcher({ className = '' }) {
  const { i18n } = useTranslation()
  const current = i18n.language?.slice(0, 2) || 'en'

  return (
    <div className={`lang-switcher ${className}`}>
      {SUPPORTED_LANGS.map(lang => (
        <button
          key={lang}
          type="button"
          className={`lang-btn${current === lang ? ' active' : ''}`}
          aria-pressed={current === lang}
          onClick={() => i18n.changeLanguage(lang)}
        >
          {LANG_LABELS[lang]}
        </button>
      ))}
    </div>
  )
}
