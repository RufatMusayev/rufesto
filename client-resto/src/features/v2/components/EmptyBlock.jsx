// Empty state: emoji icon, title, optional body and action node.
export default function EmptyBlock({ icon = '📋', title, body, action }) {
  return (
    <div className="empty v2-empty">
      <div className="empty-icon" aria-hidden="true">{icon}</div>
      <div className="v2-empty-title">{title}</div>
      {body && <p className="v2-empty-body">{body}</p>}
      {action && <div className="v2-empty-action">{action}</div>}
    </div>
  )
}
