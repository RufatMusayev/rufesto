import { BillsIcon, QrIcon, SettingsIcon } from './icons'

// Dashboard sidebar entries. `hidden` = the route exists and is role-gated but
// has no sidebar item (reached from Settings and from Tables).
export default [
  { to: '/bills',    labelKey: 'v2:navBills',    icon: BillsIcon,    roles: ['admin', 'manager', 'cashier'] },
  { to: '/settings', labelKey: 'v2:navSettings', icon: SettingsIcon, roles: ['admin', 'manager'] },
  { to: '/qr-sheet', labelKey: 'v2:navQrSheet',  icon: QrIcon,       roles: ['admin', 'manager'], hidden: true },
]
