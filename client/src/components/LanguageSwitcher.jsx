import { useTranslation } from 'react-i18next'
import { SUPPORTED_LANGS } from '../lib/i18n'

const LANG_LABELS = { en: 'EN', az: 'AZ' }

export default function LanguageSwitcher({ className = '' }) {
  const { i18n } = useTranslation()
  const current = i18n.language?.slice(0, 2) || 'en'

  return (
    <div className={`lang-switcher ${className}`} style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
      {SUPPORTED_LANGS.map(lang => (
        <button
          key={lang}
          onClick={() => i18n.changeLanguage(lang)}
          style={{
            padding: '3px 8px',
            borderRadius: '6px',
            border: current === lang ? '1px solid var(--color-gold, #C49A2C)' : '1px solid transparent',
            background: current === lang ? 'var(--color-gold-alpha, rgba(196,154,44,0.15))' : 'transparent',
            color: current === lang ? 'var(--color-gold, #C49A2C)' : 'var(--color-text-muted, #888)',
            fontSize: '12px',
            fontWeight: current === lang ? 700 : 400,
            cursor: 'pointer',
            letterSpacing: '0.05em',
            transition: 'all 0.15s',
          }}
        >
          {LANG_LABELS[lang]}
        </button>
      ))}
    </div>
  )
}
