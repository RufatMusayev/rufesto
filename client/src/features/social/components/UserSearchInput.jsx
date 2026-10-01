import { useTranslation } from 'react-i18next'
import { CloseIcon } from './Icons'

/** Search box with a clear button. Debouncing is done by the caller (useDebounced). */
export default function UserSearchInput({ value, onChange, placeholder, label, autoFocus = false, maxLength = 60 }) {
  const { t } = useTranslation('common')
  return (
    <div className="soc-search">
      <input
        className="input soc-search-input"
        type="search"
        inputMode="search"
        enterKeyHint="search"
        autoComplete="off"
        autoCapitalize="off"
        spellCheck={false}
        autoFocus={autoFocus}
        maxLength={maxLength}
        value={value}
        placeholder={placeholder}
        aria-label={label || placeholder}
        onChange={e => onChange(e.target.value)}
      />
      {value ? (
        <button type="button" className="icon-btn soc-search-clear" aria-label={t('close')} onClick={() => onChange('')}>
          <CloseIcon />
        </button>
      ) : null}
    </div>
  )
}
