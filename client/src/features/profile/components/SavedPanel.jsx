import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { EmptyState, MoneyText } from '../../../components/ui'
import { categoryEmoji, dishBackground } from '../../../lib/helpers'
import { removeSavedDish } from '../api'
import Panel, { RowSkeletons } from './Panel'
import { CloseIcon } from './Icons'

function SavedRow({ item, busy, onRemove }) {
  const { t } = useTranslation(['profile', 'common'])
  const { dish, restaurant } = item
  const slug = restaurant?.slug
  const main = (
    <>
      <div className="pf-thumb" style={{ background: dishBackground(dish.category), opacity: dish.available ? 1 : 0.5 }} aria-hidden="true">
        {categoryEmoji(dish.category)}
      </div>
      <div className="pf-row-main">
        <div className="pf-row-title">{dish.name}</div>
        <div className="pf-row-meta">
          {restaurant?.name ? <span className="pf-row-sub">{restaurant.name}</span> : null}
          <MoneyText value={dish.price} size="0.78rem" strong />
          {!dish.available ? <span className="pf-soldout">{t('common:soldOut')}</span> : null}
        </div>
      </div>
    </>
  )
  return (
    <div className="card pf-card pf-saved stagger-item">
      {slug
        ? <Link to={`/restaurant/${slug}`} className="pf-row pf-row-link">{main}</Link>
        : <div className="pf-row">{main}</div>}
      <button
        type="button" className="icon-btn pf-remove" disabled={busy}
        aria-label={t('profile:removeSaved', { name: dish.name })} onClick={() => onRemove(item.id)}
      >
        <CloseIcon size={16} />
      </button>
    </div>
  )
}

/** Profile -> Saved: saved dishes, removable (optimistic, restored when the delete fails). */
export default function SavedPanel({ resource }) {
  const { t } = useTranslation('profile')
  const [error, setError] = useState(false)
  const [pending, setPending] = useState(() => new Set())

  async function remove(id) {
    if (pending.has(id)) return
    setError(false)
    setPending(s => new Set(s).add(id))
    const before = resource.data
    resource.setData(rows => rows.filter(r => r.id !== id))
    const { error: err } = await removeSavedDish(id)
    setPending(s => { const n = new Set(s); n.delete(id); return n })
    if (err) {
      setError(true)
      resource.setData(() => before)
    }
  }

  return (
    <Panel
      resource={resource}
      skeleton={<RowSkeletons count={4} />}
      empty={<EmptyState icon="🍽️" title={t('noSaved')} body={t('noSavedHint')} />}
    >
      {rows => (
        <div className="pf-list">
          {error ? <p className="pf-error" role="alert">{t('errRemoveFailed')}</p> : null}
          {rows.map(item => <SavedRow key={item.id} item={item} busy={pending.has(item.id)} onRemove={remove} />)}
        </div>
      )}
    </Panel>
  )
}
