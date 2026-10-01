// Small rounded label. gray|amber|green|red|blue use the shared .pill classes; gold and demo
// are defined here because index.css has no class for them.
const EXTRA = {
  gold: {
    background: 'rgba(196,154,44,0.12)', color: 'var(--gold)',
    borderColor: 'rgba(196,154,44,0.3)',
  },
  demo: {
    background: 'rgba(196,154,44,0.12)', color: 'var(--gold)',
    border: '1px dashed var(--gold)',
    fontSize: '0.62rem', fontWeight: 800, textTransform: 'uppercase',
    letterSpacing: '0.06em', padding: '0.15rem 0.5rem', borderRadius: 100,
  },
}

export default function Pill({ tone = 'gray', children, icon }) {
  const extra = EXTRA[tone]
  return (
    <span className={extra ? 'pill' : `pill ${tone}`} style={extra}>
      {icon ? <span aria-hidden="true">{icon}</span> : null}
      {children}
    </span>
  )
}
