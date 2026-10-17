import { memo } from 'react'
import Section, { Rail } from './Section'
import RestaurantCard from './RestaurantCard'

/** A horizontal rail of compact place cards under a heading; hidden when `items` is empty. */
export default memo(function RestaurantRail({ title, items, action }) {
  return (
    <Section title={title} empty={items.length === 0} action={action}>
      <Rail label={title}>
        {items.map(r => (
          <div key={r.id} role="listitem" className="dsc-rail-item"><RestaurantCard r={r} /></div>
        ))}
      </Rail>
    </Section>
  )
})
