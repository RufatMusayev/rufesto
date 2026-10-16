import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import Section from './Section'
import RestaurantCard from './RestaurantCard'

const FIRST = 12            // cards rendered at once; "Show more" adds the same again (keeps the DOM small)

/** Every active restaurant, same ranking as "Open now" without the open filter: the old list, as cards. */
export default function AllRestaurantsList({ title, items }) {
  const { t } = useTranslation('social')
  const [shown, setShown] = useState(FIRST)
  return (
    <Section title={title} empty={items.length === 0} className="dsc-sec-all">
      <div className="dsc-list">
        {items.slice(0, shown).map(r => <RestaurantCard key={r.id} r={r} variant="list" />)}
      </div>
      {items.length > shown && (
        <div className="dsc-more">
          <button type="button" className="btn btn-ghost" onClick={() => setShown(n => n + FIRST)}>
            {t('discover.showMore')}
          </button>
        </div>
      )}
    </Section>
  )
}
