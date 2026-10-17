import { useTranslation } from 'react-i18next'

export const TAB_IDS = ['posts', 'menu']

const ICONS = {
  posts: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3.5" y="3.5" width="7" height="7" rx="1" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="1" />
    </svg>
  ),
  menu: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 3.5h12a1 1 0 0 1 1 1v15a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-15a1 1 0 0 1 1-1z" />
      <path d="M8.5 8h7M8.5 12h7M8.5 16h4" />
    </svg>
  ),
}

/**
 * Sticky two-tab bar (Posts | Menu). The bar docks under the app header (--sticky-top); the gold indicator slides
 * between the tabs (transform only). Roving tabindex + arrow keys, as a tablist should behave.
 */
export default function RestaurantTabs({ tab, onChange }) {
  const { t } = useTranslation('restaurant')
  const index = Math.max(0, TAB_IDS.indexOf(tab))

  function onKeyDown(e) {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
    e.preventDefault()
    const next = TAB_IDS[(index + (e.key === 'ArrowRight' ? 1 : TAB_IDS.length - 1)) % TAB_IDS.length]
    onChange(next)
    requestAnimationFrame(() => document.getElementById(`rst-tab-${next}`)?.focus())
  }

  return (
    <div className="rst-tabs" data-i={index}>
      <div className="rst-tabs-in" role="tablist" aria-label={t('tabs.label')} onKeyDown={onKeyDown}>
        {TAB_IDS.map(id => (
          <button
            key={id}
            type="button"
            role="tab"
            id={`rst-tab-${id}`}
            className="rst-tab"
            aria-selected={tab === id}
            aria-controls={`rst-panel-${id}`}
            tabIndex={tab === id ? 0 : -1}
            onClick={() => onChange(id)}
          >
            {ICONS[id]}
            <span>{t(`tabs.${id}`)}</span>
          </button>
        ))}
        <span className="rst-tab-bar" aria-hidden="true" />
      </div>
    </div>
  )
}
