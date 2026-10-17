import { Avatar } from '../../components/ui'
import { LineIcon } from './Icons'

/**
 * The left column of an inbox row, always 44 px wide (docs/UX-PLAN-2026-10-18.md 2.2). No emoji badges:
 *  - one person: their avatar;
 *  - a group: two 32 px avatars, offset, each with a 2 px ring in the page colour;
 *  - a venue: the restaurant's own avatar (a place_post has a place behind it, not a person);
 *  - nobody (a booking, a bill, a table): a --s3 circle with a line icon.
 */
export default function Leading({ view, actors }) {
  if (view.lead === 'actors' && actors.length > 0) {
    if (actors.length === 1) {
      return <span className="ntf-lead"><Avatar name={actors[0].name} src={actors[0].photo} size={44} /></span>
    }
    return (
      <span className="ntf-lead ntf-lead-pair">
        <span className="ntf-av ntf-av-1"><Avatar name={actors[0].name} src={actors[0].photo} size={32} /></span>
        <span className="ntf-av ntf-av-2"><Avatar name={actors[1].name} src={actors[1].photo} size={32} /></span>
      </span>
    )
  }
  if (view.lead === 'venue' && view.venue) {
    return <span className="ntf-lead"><Avatar name={view.venue.name} src={view.venue.logo} size={44} /></span>
  }
  return <span className="ntf-lead ntf-lead-icon"><LineIcon name={view.icon} size={20} /></span>
}
