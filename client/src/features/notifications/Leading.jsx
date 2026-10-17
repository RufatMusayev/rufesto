import { Avatar } from '../../components/ui'

// The left column of an inbox row, always 48px wide so the text lines up:
//  - actors: the person's avatar (one), or up to three overlapping avatars for a group, with the type's glyph as a badge;
//  - venue: the restaurant's own avatar (a place_post / promotion has no person behind it);
//  - icon: the type's glyph in a tinted circle (bookings, bills, food ready...).
export default function Leading({ view, actors }) {
  if (view.lead === 'actors' && actors.length > 0) {
    const shown = actors.slice(0, 3)
    if (shown.length === 1) {
      const a = shown[0]
      return (
        <span className="ntf-lead">
          <Avatar name={a.name} src={a.photo} size={44} />
          <span className="ntf-badge ntf-badge-br" aria-hidden="true">{view.icon}</span>
        </span>
      )
    }
    return (
      <span className="ntf-lead ntf-lead-multi">
        <span className="ntf-av ntf-av-1"><Avatar name={shown[0].name} src={shown[0].photo} size={30} /></span>
        <span className="ntf-av ntf-av-2"><Avatar name={shown[1].name} src={shown[1].photo} size={30} /></span>
        {shown[2] ? <span className="ntf-av ntf-av-3"><Avatar name={shown[2].name} src={shown[2].photo} size={22} /></span> : null}
        <span className="ntf-badge ntf-badge-tr" aria-hidden="true">{view.icon}</span>
      </span>
    )
  }
  if (view.lead === 'venue' && view.venue) {
    return (
      <span className="ntf-lead">
        <Avatar name={view.venue.name} src={view.venue.logo} size={44} />
        <span className="ntf-badge ntf-badge-br" aria-hidden="true">{view.icon}</span>
      </span>
    )
  }
  return (
    <span className={`ntf-lead ntf-tone-${view.tone}`}>
      <span className="ntf-lead-icon" aria-hidden="true">{view.icon}</span>
    </span>
  )
}
