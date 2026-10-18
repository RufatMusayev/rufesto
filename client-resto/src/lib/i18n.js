import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import LanguageDetector from 'i18next-browser-languagedetector'

import commonEN from '../locales/en/common.json'
import commonAZ from '../locales/az/common.json'
import commonRU from '../locales/ru/common.json'
import navEN from '../locales/en/nav.json'
import navAZ from '../locales/az/nav.json'
import navRU from '../locales/ru/nav.json'
import authEN from '../locales/en/auth.json'
import authAZ from '../locales/az/auth.json'
import authRU from '../locales/ru/auth.json'
import menuEN from '../locales/en/menu.json'
import menuAZ from '../locales/az/menu.json'
import menuRU from '../locales/ru/menu.json'
import bookingEN from '../locales/en/booking.json'
import bookingAZ from '../locales/az/booking.json'
import bookingRU from '../locales/ru/booking.json'
import tableEN from '../locales/en/table.json'
import tableAZ from '../locales/az/table.json'
import tableRU from '../locales/ru/table.json'
import ordersEN from '../locales/en/orders.json'
import ordersAZ from '../locales/az/orders.json'
import ordersRU from '../locales/ru/orders.json'
import dashboardEN from '../locales/en/dashboard.json'
import dashboardAZ from '../locales/az/dashboard.json'
import dashboardRU from '../locales/ru/dashboard.json'
import v2EN from '../locales/en/v2.json'
import v2AZ from '../locales/az/v2.json'
import v2RU from '../locales/ru/v2.json'

// Order here is the order of the language switcher: AZ · EN · RU.
export const SUPPORTED_LANGS = ['az', 'en', 'ru']
export const DEFAULT_LANG = 'en'

const resources = {
  en: {
    common: commonEN, nav: navEN, auth: authEN,
    menu: menuEN, booking: bookingEN, table: tableEN,
    orders: ordersEN, dashboard: dashboardEN, v2: v2EN,
  },
  az: {
    common: commonAZ, nav: navAZ, auth: authAZ,
    menu: menuAZ, booking: bookingAZ, table: tableAZ,
    orders: ordersAZ, dashboard: dashboardAZ, v2: v2AZ,
  },
  ru: {
    common: commonRU, nav: navRU, auth: authRU,
    menu: menuRU, booking: bookingRU, table: tableRU,
    orders: ordersRU, dashboard: dashboardRU, v2: v2RU,
  },
}

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    supportedLngs: SUPPORTED_LANGS,
    fallbackLng: DEFAULT_LANG,
    defaultNS: 'common',
    ns: Object.keys(resources.en),
    interpolation: { escapeValue: false },
    detection: {
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: 'rufesto_lang',
      caches: ['localStorage'],
      // 'ru-RU' -> 'ru': the browser's FIRST preference decides ('az-AZ, ru' gives az, 'ru-RU, en' gives ru). Without
      // this i18next takes the first code that is an exact match, so 'en-US, ru' would pick ru over en-US.
      convertDetectedLanguage: lng => String(lng).split('-')[0],
    },
    react: { useSuspense: false },
  })

// <html lang> follows the dashboard language (screen readers, hyphenation, and the right font for Cyrillic).
if (typeof document !== 'undefined') {
  const syncHtmlLang = lng => { document.documentElement.lang = String(lng || DEFAULT_LANG).slice(0, 2) }
  syncHtmlLang(i18n.resolvedLanguage || i18n.language)
  i18n.on('languageChanged', syncHtmlLang)
}

export default i18n
