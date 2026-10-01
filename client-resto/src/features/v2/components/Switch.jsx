// Accessible on/off switch (role="switch"); the visible label is the caller's.
export default function Switch({ checked, onChange, label, disabled = false, id }) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      className={`v2-switch${checked ? ' is-on' : ''}`}
      onClick={() => onChange(!checked)}
    >
      <span className="v2-switch-knob" />
    </button>
  )
}
