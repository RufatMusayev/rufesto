// How a bill status (view-model: 'open' | 'requested' | 'paying' | 'paid' | 'void') is drawn: Pill tone and i18n key.
export const STATUS_TONE = { open: 'gray', requested: 'amber', paying: 'blue', paid: 'green', void: 'red' }
export const STATUS_KEY = {
  open: 'statusOpen', requested: 'statusRequested', paying: 'statusPaying', paid: 'statusPaid', void: 'statusVoid',
}
