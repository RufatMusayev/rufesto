import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import LoadError from '../../../components/LoadError'
import { cuisineEmoji } from '../../../lib/helpers'
import { searchRestaurants } from '../api'
import { useDebounced } from '../hooks'
import UserSearchInput from './UserSearchInput'
import { CloseIcon } from './Icons'

/** Search active restaurants by name (2+ characters); the pick shows as a chip with an X. */
export default function RestaurantPicker({ value, onChange, disabled = false }) {
  const { t } = useTranslation('social')
  const [q, setQ] = useState('')
  const debounced = useDebounced(q.trim(), 300)
  const [state, setState] = useState({ list: null, loading: false, error: null })
  const [attempt, setAttempt] = useState(0)
  const seq = useRef(0)

  useEffect(() => {
    if (debounced.length < 2) { seq.current++; setState({ list: null, loading: false, error: null }); return }
    const mine = ++seq.current
    setState(s => ({ ...s, loading: true, error: null }))
    searchRestaurants(debounced).then(({ data, error }) => {
      if (mine !== seq.current) return
      setState(error ? { list: null, loading: false, error } : { list: data, loading: false, error: null })
    })
  }, [debounced, attempt])

  if (value) {
    return (
      <div className="soc-picked">
        <span className="soc-picked-chip">
          <span aria-hidden="true">{cuisineEmoji(value.cuisine_type)}</span>
          <span className="soc-picked-name">{value.name}</span>
          <button type="button" className="soc-picked-x hit-ext" aria-label={t('newPost.clearRestaurant')} onClick={() => onChange(null)} disabled={disabled}>
            <CloseIcon size={12} />
          </button>
        </span>
      </div>
    )
  }

  return (
    <div>
      <UserSearchInput value={q} onChange={setQ} placeholder={t('newPost.restaurantPlaceholder')} label={t('newPost.restaurant')} />
      {state.error && <LoadError onRetry={() => setAttempt(a => a + 1)} />}
      {state.loading && <p className="soc-hint">{t('newPost.searching')}</p>}
      {!state.loading && state.list && state.list.length === 0 && <p className="soc-hint">{t('newPost.noRestaurants')}</p>}
      {state.list && state.list.length > 0 && (
        <ul className="soc-results" role="listbox" aria-label={t('newPost.restaurant')}>
          {state.list.map(r => (
            <li key={r.id}>
              <button type="button" role="option" aria-selected="false" className="soc-result" onClick={() => { onChange(r); setQ('') }}>
                <span aria-hidden="true">{cuisineEmoji(r.cuisine_type)}</span>
                <span className="soc-result-name">{r.name}</span>
                {r.cuisine_type && <span className="soc-result-sub">{r.cuisine_type}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
