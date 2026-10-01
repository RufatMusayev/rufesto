// Registers the `social` namespace so this feature works on its own. The integrator may also
// register it in lib/i18n.js (resources.en.social = socialEN ...); adding the same bundle twice is harmless.
import i18n from '../../lib/i18n'
import socialEN from '../../locales/en/social.json'
import socialAZ from '../../locales/az/social.json'

i18n.addResourceBundle('en', 'social', socialEN, true, true)
i18n.addResourceBundle('az', 'social', socialAZ, true, true)

export default i18n
