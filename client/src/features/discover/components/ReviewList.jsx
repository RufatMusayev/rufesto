import { memo } from 'react'
import Section from './Section'
import ReviewCard from '../../social/components/ReviewCard'

/** Top reviews of the last two weeks: the existing review card (like, dish chip, photo), one per row. */
export default memo(function ReviewList({ title, items }) {
  return (
    <Section title={title} empty={items.length === 0} className="dsc-sec-reviews">
      {items.map((it, i) => <ReviewCard key={it.id} item={it} index={i} />)}
    </Section>
  )
})
