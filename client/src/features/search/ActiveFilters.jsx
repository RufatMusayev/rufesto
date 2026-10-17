import { useTranslation } from 'react-i18next'
import { cuisineLabel } from '../discover/cuisine'

/** The filters that are on, as removable chips under the field (x removes that one filter and searches again). */
export default function ActiveFilters({ filters, onChange }) {
  const { t } = useTranslation('search')
  const { t: ts } = useTranslation('social')
  const chips = []
  if (filters.open) chips.push({ id: 'open', label: t('open'), next: { ...filters, open: false } })
  if (filters.cuisine) chips.push({ id: 'cuisine', label: cuisineLabel(ts, filters.cuisine), next: { ...filters, cuisine: null } })
  if (filters.price) chips.push({ id: 'price', label: '₼'.repeat(filters.price), next: { ...filters, price: null } })
  if (filters.km) chips.push({ id: 'km', label: `≤ ${t('km', { count: filters.km })}`, next: { ...filters, km: null } })
  for (const d of filters.diet) {
    chips.push({ id: `diet-${d}`, label: t(`diets.${d}`), next: { ...filters, diet: filters.diet.filter(x => x !== d) } })
  }
  if (!chips.length) return null
  return (
    <div className="sr-active no-scrollbar">
      {chips.map(c => (
        <button
          key={c.id} type="button" className="sr-achip" onClick={() => onChange(c.next)}
          aria-label={t('removeFilter', { name: c.label })}
        >
          {c.label}
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      ))}
    </div>
  )
}
