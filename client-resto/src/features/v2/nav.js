import { BillsIcon, MyTipsIcon, PostsIcon, QrIcon, SettingsIcon, TipsIcon } from './icons'

// Dashboard sidebar entries. `hidden` = the route exists and is role-gated but
// has no sidebar item (reached from Settings, Tables and the Tips page).
// `more` = the phone "More" sheet (components/layout/MobileMoreSheet.jsx) lists it as well, because the
// scrolling bottom bar of admin and manager is already long.
// /settings is open to every role: admin and manager get all tabs, the other roles only Notifications ("Notify me on
// this device", V2-CONTRACT 21.5; SettingsPage.jsx decides the tabs).
// /my-tips is listed twice: in the sidebar for floor staff, hidden for
// manager / admin (their sidebar is already full; Tips links to it).
export default [
  { to: '/bills',    labelKey: 'v2:navBills',    icon: BillsIcon,    roles: ['admin', 'manager', 'cashier'] },
  { to: '/tips',     labelKey: 'v2:navTips',     icon: TipsIcon,     roles: ['admin', 'manager'] },
  { to: '/my-tips',  labelKey: 'v2:navMyTips',   icon: MyTipsIcon,   roles: ['waiter', 'host', 'cashier'] },
  { to: '/posts',    labelKey: 'v2:navPosts',    icon: PostsIcon,    roles: ['admin', 'manager'], more: true },
  { to: '/settings', labelKey: 'v2:navSettings', icon: SettingsIcon, roles: ['admin', 'manager', 'waiter', 'host', 'cashier', 'kitchen'] },
  { to: '/qr-sheet', labelKey: 'v2:navQrSheet',  icon: QrIcon,       roles: ['admin', 'manager'], hidden: true },
  { to: '/my-tips',  labelKey: 'v2:navMyTips',   icon: MyTipsIcon,   roles: ['admin', 'manager'], hidden: true },
]
