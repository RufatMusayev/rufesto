import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import LanguageDetector from 'i18next-browser-languagedetector'

import commonEN from '../locales/en/common.json'
import commonAZ from '../locales/az/common.json'
import navEN from '../locales/en/nav.json'
import navAZ from '../locales/az/nav.json'
import authEN from '../locales/en/auth.json'
import authAZ from '../locales/az/auth.json'
import menuEN from '../locales/en/menu.json'
import menuAZ from '../locales/az/menu.json'
import bookingEN from '../locales/en/booking.json'
import bookingAZ from '../locales/az/booking.json'
import tableEN from '../locales/en/table.json'
import tableAZ from '../locales/az/table.json'
import ordersEN from '../locales/en/orders.json'
import ordersAZ from '../locales/az/orders.json'
import dashboardEN from '../locales/en/dashboard.json'
import dashboardAZ from '../locales/az/dashboard.json'

export const SUPPORTED_LANGS = ['en', 'az']
export const DEFAULT_LANG = 'en'

const resources = {
  en: {
    common: commonEN, nav: navEN, auth: authEN,
    menu: menuEN, booking: bookingEN, table: tableEN,
    orders: ordersEN, dashboard: dashboardEN,
  },
  az: {
    common: commonAZ, nav: navAZ, auth: authAZ,
    menu: menuAZ, booking: bookingAZ, table: tableAZ,
    orders: ordersAZ, dashboard: dashboardAZ,
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
    },
    react: { useSuspense: false },
  })

export default i18n
