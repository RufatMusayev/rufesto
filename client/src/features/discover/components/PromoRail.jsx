import { memo } from 'react'
import Section, { Rail } from './Section'
import FeedItem from '../../feed/components/FeedItem'

/** Active promos: the existing PromoCard, with the same impression and click tracking as on Home. */
export default memo(function PromoRail({ title, items, events }) {
  return (
    <Section title={title} empty={items.length === 0}>
      <Rail label={title}>
        {items.map((p, i) => (
          <div key={p.id} role="listitem" className="dsc-rail-item dsc-rail-promo">
            <FeedItem item={{ ...p, position: i + 1 }} index={i} events={events} className="dsc-promo" />
          </div>
        ))}
      </Rail>
    </Section>
  )
})
