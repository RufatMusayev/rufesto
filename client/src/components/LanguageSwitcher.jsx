import { useTranslation } from 'react-i18next'
import { SUPPORTED_LANGS } from '../lib/i18n'

const LANG_LABELS = { az: 'AZ', en: 'EN', ru: 'RU' }
// each language in its own words, for the accessible name of its button
const LANG_NAMES = { az: 'Azərbaycan dili', en: 'English', ru: 'Русский' }

/**
 * AZ · EN · RU switch. The choice is stored by the language detector in localStorage (rufesto_lang), so it is the same
 * signed in or out. Profile > Settings is its only home (docs/UX-PLAN-2026-10-18.md D10: it left the top bar and the rail).
 */
export default function LanguageSwitcher({ className = '' }) {
  const { t, i18n } = useTranslation('common')
  const current = i18n.language?.slice(0, 2) || 'en'

  return (
    <div className={`lang-switcher ${className}`} role="group" aria-label={t('language')}>
      {SUPPORTED_LANGS.map(lang => (
        <button
          key={lang}
          type="button"
          lang={lang}
          className={`lang-btn${current === lang ? ' active' : ''}`}
          aria-pressed={current === lang}
          aria-label={t('switchToLanguage', { language: LANG_NAMES[lang] })}
          onClick={() => i18n.changeLanguage(lang)}
        >
          {LANG_LABELS[lang]}
        </button>
      ))}
    </div>
  )
}
