import './i18n'
import { PeopleIcon } from './components/Icons'

// Not a bottom-nav tab: a shortcut on the Profile screen and an item in the desktop sidebar.
export default [
  { id: 'friends', to: '/friends', labelKey: 'social:navFriends', icon: PeopleIcon, placement: 'profile' },
]
