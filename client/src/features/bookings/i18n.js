// Registers the `bookings` namespace so this feature works on its own. The integrator may also
// register it in lib/i18n.js (resources.en.bookings = bookingsEN ...); adding the same bundle twice is harmless.
import i18n from '../../lib/i18n'
import bookingsEN from '../../locales/en/bookings.json'
import bookingsAZ from '../../locales/az/bookings.json'

i18n.addResourceBundle('en', 'bookings', bookingsEN, true, true)
i18n.addResourceBundle('az', 'bookings', bookingsAZ, true, true)

export default i18n
