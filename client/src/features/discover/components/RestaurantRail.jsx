import Section, { Rail } from './Section'
import RestaurantCard from './RestaurantCard'

/** A horizontal rail of restaurant cards under a serif heading; hidden when `items` is empty. */
export default function RestaurantRail({ title, items }) {
  return (
    <Section title={title} empty={items.length === 0}>
      <Rail label={title}>
        {items.map(r => (
          <div key={r.id} role="listitem" className="dsc-rail-item dsc-rail-rest">
            <RestaurantCard r={r} variant="rail" />
          </div>
        ))}
      </Rail>
    </Section>
  )
}
