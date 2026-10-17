import { memo } from 'react'
import MenuRow from './MenuRow'
import { sectionDomId } from './useScrollSpy'

/** One printed section: ornamented title, then its dishes. The theme CSS decides how the title and ornament look. */
function MenuSection({ id, title, icon, dishes, lang, photos, seated, onOpen, onAdd }) {
  const dom = sectionDomId(id)
  return (
    <section className="mn-sec" id={dom} aria-labelledby={`${dom}-t`}>
      <header className="mn-sec-head">
        {icon && <span className="mn-sec-icon" aria-hidden="true">{icon}</span>}
        <h3 className="mn-sec-title" id={`${dom}-t`}>{title}</h3>
        <span className="mn-orn" aria-hidden="true"><i /><b /><i /></span>
      </header>
      <ul className="mn-list">
        {dishes.map(d => (
          <MenuRow key={d.id} dish={d} lang={lang} photos={photos} seated={seated} onOpen={onOpen} onAdd={onAdd} />
        ))}
      </ul>
    </section>
  )
}

export default memo(MenuSection)
