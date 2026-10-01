// Centered "nothing here" block on top of .empty. `icon` is an emoji string, `action` a node.
export default function EmptyState({ icon, title, body, action }) {
  return (
    <div className="empty" role="status">
      {icon ? <div className="empty-icon" aria-hidden="true">{icon}</div> : null}
      {title ? <div className="state-title">{title}</div> : null}
      {body ? <p className="state-body">{body}</p> : null}
      {action ? <div style={{ marginTop: 16, display: 'flex', justifyContent: 'center' }}>{action}</div> : null}
    </div>
  )
}
