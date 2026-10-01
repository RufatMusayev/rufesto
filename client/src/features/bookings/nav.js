import './i18n'
import { PeopleIcon } from './components/Icons'

// No sidebar or bottom-nav item: entry points are the mounts (restaurant page button, Profile tab, invite links).
export default [
  { id: 'bookings', to: '/profile', labelKey: 'bookings:navBookings', icon: PeopleIcon, placement: 'none' },
]
