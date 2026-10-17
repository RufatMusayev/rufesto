import { useTranslation } from 'react-i18next'

const SearchIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
    <circle cx="10.5" cy="10.5" r="7" /><line x1="16" y1="16" x2="21.5" y2="21.5" />
  </svg>
)
const SlidersIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
    <line x1="4" y1="7" x2="20" y2="7" /><line x1="4" y1="17" x2="20" y2="17" />
    <circle cx="9" cy="7" r="2.2" fill="var(--bg)" /><circle cx="15" cy="17" r="2.2" fill="var(--bg)" />
  </svg>
)

/**
 * The sticky search bar: a 44 px field (no border) and, on its right, the Filters button (a dot when filters are on)
 * or, while the field has focus, "Cancel" (blurs and clears). Enter saves the query to Recent and closes the keyboard.
 */
export default function SearchField({
  value, onChange, onSubmit, onCancel, focused, onFocusChange, inputRef, filtersCount, onFilters,
}) {
  const { t } = useTranslation('search')
  return (
    <div className="sr-bar">
      <form className="sr-field" role="search" onSubmit={e => { e.preventDefault(); onSubmit() }}>
        <span className="sr-field-icon"><SearchIcon /></span>
        <input
          ref={inputRef}
          className="sr-input" type="search" inputMode="search" enterKeyHint="search"
          autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false} maxLength={60}
          value={value} placeholder={t('placeholder')} aria-label={t('fieldLabel')}
          onChange={e => onChange(e.target.value)}
          onFocus={() => onFocusChange(true)} onBlur={() => onFocusChange(false)}
        />
        {value && (
          <button
            type="button" className="sr-clear" aria-label={t('clearField')}
            onPointerDown={e => e.preventDefault()}
            onClick={() => { onChange(''); inputRef.current?.focus() }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="12" cy="12" r="10" fill="currentColor" opacity="0.35" />
              <path d="M8.5 8.5l7 7M15.5 8.5l-7 7" stroke="var(--bg)" strokeWidth="2" strokeLinecap="round" fill="none" />
            </svg>
          </button>
        )}
      </form>
      {focused ? (
        <button
          type="button" className="sr-cancel" onPointerDown={e => e.preventDefault()}
          onClick={() => { inputRef.current?.blur(); onCancel() }}
        >
          {t('cancel')}
        </button>
      ) : (
        <button
          type="button" className="sr-filter-btn pressable" onClick={onFilters}
          aria-label={filtersCount ? t('filtersActive', { count: filtersCount }) : t('filters')}
        >
          <SlidersIcon />
          {filtersCount > 0 && <span className="sr-filter-dot" aria-hidden="true" />}
        </button>
      )}
    </div>
  )
}
