// Campaign vocabulary shared by pages/PromosPage.jsx and components/PromoFormModal.jsx.

// Writes to ad_campaigns are manager-only (RLS); a non-manager's failed write is
// reported as this instead of a raw policy error.
export const MANAGERS_ONLY = { permission: 'errManagersOnly' }

export const TYPES = ['feed_placement', 'discount', 'highlight', 'banner']
export const TYPE_KEYS = {
  feed_placement: 'typeFeed', discount: 'typeDiscount',
  highlight: 'typeHighlight', banner: 'typeBanner',
}
export const STATUS_LABEL_KEYS = {
  draft: 'promoStatusDraft', active: 'promoStatusActive', paused: 'promoStatusPaused',
  completed: 'promoStatusCompleted', cancelled: 'promoStatusCancelled',
}
// The campaign form only ever creates/edits into these two statuses; Activate,
// Pause and Cancel (on the card) are the only paths to active/completed/cancelled,
// and are manager-only actions.
export const FORM_STATUSES = ['draft', 'paused']

const pad = n => String(n).padStart(2, '0')

/** A Date as the value of a `datetime-local` input (the viewer's local time). */
export function toInputValue(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** An ISO instant as the value of a `datetime-local` input; '' for none. */
export function toLocalInput(iso) {
  if (!iso) return ''
  return toInputValue(new Date(iso))
}

/** The window a new campaign starts with: now to seven days from now. */
export function defaultWindow(now = new Date()) {
  const start = new Date(now)
  start.setSeconds(0, 0)
  const end = new Date(start)
  end.setDate(end.getDate() + 7)
  return { starts_at: toInputValue(start), ends_at: toInputValue(end) }
}
