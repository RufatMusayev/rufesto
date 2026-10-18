import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import LanguageDetector from 'i18next-browser-languagedetector'

// Core namespaces: what the first screen needs (the Home feed, the top bar, the bottom nav, the sign-in sheet, the sheets
// themselves). All three languages are bundled, so a guest can switch language without a request. Every other namespace is in
// i18nExtra.<lng>.js, a chunk that is requested the moment this module runs (see loadExtraNamespaces) and registered when it
// arrives; the entry chunk no longer carries ~22 kB gzip of strings for screens the guest has not opened.
import commonEN from '../locales/en/common.json'
import commonAZ from '../locales/az/common.json'
import commonRU from '../locales/ru/common.json'
import navEN from '../locales/en/nav.json'
import navAZ from '../locales/az/nav.json'
import navRU from '../locales/ru/nav.json'
import authEN from '../locales/en/auth.json'
import authAZ from '../locales/az/auth.json'
import authRU from '../locales/ru/auth.json'
import feedEN from '../locales/en/feed.json'
import feedAZ from '../locales/az/feed.json'
import feedRU from '../locales/ru/feed.json'
// features/social, features/reviews (and floor, search, ...) also self-register their namespace, adding it twice is harmless
import socialEN from '../locales/en/social.json'
import socialAZ from '../locales/az/social.json'
import socialRU from '../locales/ru/social.json'

// Order = the order of the language switch (AZ · EN · RU). A first visit takes the first of navigator.languages that is one
// of these (ru-RU -> ru, az-AZ -> az, tr + en -> en); anything else gets DEFAULT_LANG. The choice is cached in localStorage.
export const SUPPORTED_LANGS = ['az', 'en', 'ru']
export const DEFAULT_LANG = 'en'

const resources = {
  en: { common: commonEN, nav: navEN, auth: authEN, feed: feedEN, social: socialEN },
  az: { common: commonAZ, nav: navAZ, auth: authAZ, feed: feedAZ, social: socialAZ },
  ru: { common: commonRU, nav: navRU, auth: authRU, feed: feedRU, social: socialRU },
}

// First visit: the first language of navigator.languages that the app has (['en-US', 'ru'] -> en, ['uk', 'ru'] -> ru,
// ['tr', 'az'] -> az, ['de'] -> DEFAULT_LANG). The detector's own 'navigator' lookup would pick an exact code anywhere in the
// list ('ru') before the language part of an earlier one ('en-US'), so the order the guest set in the browser is read here.
const detector = new LanguageDetector()
detector.addDetector({
  name: 'preferredLanguage',
  lookup() {
    const prefs = typeof navigator !== 'undefined' ? (navigator.languages?.length ? navigator.languages : [navigator.language]) : []
    for (const code of prefs) {
      const short = String(code || '').slice(0, 2).toLowerCase()
      if (SUPPORTED_LANGS.includes(short)) return short
    }
    return undefined
  },
})

i18n
  .use(detector)
  .use(initReactI18next)
  .init({
    resources,
    supportedLngs: SUPPORTED_LANGS,
    fallbackLng: DEFAULT_LANG,
    defaultNS: 'common',
    ns: Object.keys(resources.en),
    interpolation: { escapeValue: false },
    detection: {
      order: ['localStorage', 'preferredLanguage'],
      lookupLocalStorage: 'rufesto_lang',
      caches: ['localStorage'],
    },
    // bindI18nStore: a namespace that arrives late (the extra chunk) re-renders the components that already asked for it
    react: { useSuspense: false, bindI18nStore: 'added' },
  })

// ---- the other namespaces: restaurant, menu, cart, booking, table, profile, notifications, map, bookings, bills ----
const EXTRA = {
  en: () => import('./i18nExtra.en'),
  az: () => import('./i18nExtra.az'),
  ru: () => import('./i18nExtra.ru'),
}
const extraLoaded = {}

/** Fetch and register the non-core namespaces of one language (once). Resolves when they are in the store. */
export function loadExtraNamespaces(lng) {
  const lang = SUPPORTED_LANGS.includes(lng) ? lng : DEFAULT_LANG
  if (!extraLoaded[lang]) {
    extraLoaded[lang] = EXTRA[lang]().then(mod => {
      for (const [ns, bundle] of Object.entries(mod.default)) i18n.addResourceBundle(lang, ns, bundle, true, true)
    }).catch(() => { extraLoaded[lang] = null }) // offline: asked again on the next language change / call
  }
  return extraLoaded[lang]
}

const shortLang = lng => String(lng || DEFAULT_LANG).slice(0, 2)
const current = shortLang(i18n.resolvedLanguage || i18n.language)
loadExtraNamespaces(current)
// English is the fallback language: have it too, a little later, when the guest reads another one
if (current !== DEFAULT_LANG) setTimeout(() => loadExtraNamespaces(DEFAULT_LANG), 2000)
i18n.on('languageChanged', lng => loadExtraNamespaces(shortLang(lng)))

export default i18n
