// Registers the `floor` namespace so this feature works on its own. The integrator may also register it in
// lib/i18n.js (resources.en.floor = floorEN ...); adding the same bundle twice is harmless.
import i18n from '../../lib/i18n'
import floorEN from '../../locales/en/floor.json'
import floorAZ from '../../locales/az/floor.json'

i18n.addResourceBundle('en', 'floor', floorEN, true, true)
i18n.addResourceBundle('az', 'floor', floorAZ, true, true)

export default i18n
