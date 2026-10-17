// Registers the `search` namespace so the feature works on its own (same pattern as features/social/i18n.js);
// lib/i18n.js stays untouched. Adding the same bundle twice is harmless.
import i18n from '../../lib/i18n'
import searchEN from '../../locales/en/search.json'
import searchAZ from '../../locales/az/search.json'

i18n.addResourceBundle('en', 'search', searchEN, true, true)
i18n.addResourceBundle('az', 'search', searchAZ, true, true)

export default i18n
