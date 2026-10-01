// Registers the `bills` namespace so this feature works on its own. The integrator may also register it in
// lib/i18n.js (resources.en.bills = billsEN ...); adding the same bundle twice is harmless.
import i18n from '../../lib/i18n'
import billsEN from '../../locales/en/bills.json'
import billsAZ from '../../locales/az/bills.json'

i18n.addResourceBundle('en', 'bills', billsEN, true, true)
i18n.addResourceBundle('az', 'bills', billsAZ, true, true)

export default i18n
