// Words for the open state of a place (lib/openState.js decides the state, this only picks the sentence).
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

/** `st` = openState(place, now); `t` = translate function of the map namespace. */
export function statusLabel(t, st) {
  if (st.state === 'open') return st.time ? t('openUntil', { t: st.time }) : t('chipOpen')
  if (st.state === 'soon') return t('closesSoon', { t: st.time })
  if (!st.time) return t('closed')
  if (st.day === 'tomorrow') return t('opensTomorrow', { t: st.time })
  if (DAYS.includes(st.day)) return t('opensDay', { day: t(`days.${st.day}`), t: st.time })
  return t('opensAt', { t: st.time })
}

