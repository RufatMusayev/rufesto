import { memo } from 'react'
import Section, { Rail } from './Section'
import DishCard from './DishCard'

/** A horizontal rail of dish cards under a serif heading; hidden when `items` is empty. */
export default memo(function DishRail({ title, items }) {
  return (
    <Section title={title} empty={items.length === 0}>
      <Rail label={title}>
        {items.map(d => (
          <div key={d.id} role="listitem" className="dsc-rail-item dsc-rail-dish"><DishCard d={d} /></div>
        ))}
      </Rail>
    </Section>
  )
})
