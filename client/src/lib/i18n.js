import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import LanguageDetector from 'i18next-browser-languagedetector'

import commonEN from '../locales/en/common.json'
import commonAZ from '../locales/az/common.json'
import navEN from '../locales/en/nav.json'
import navAZ from '../locales/az/nav.json'
import authEN from '../locales/en/auth.json'
import authAZ from '../locales/az/auth.json'
import feedEN from '../locales/en/feed.json'
import feedAZ from '../locales/az/feed.json'
import restaurantEN from '../locales/en/restaurant.json'
import restaurantAZ from '../locales/az/restaurant.json'
import menuEN from '../locales/en/menu.json'
import menuAZ from '../locales/az/menu.json'
import cartEN from '../locales/en/cart.json'
import cartAZ from '../locales/az/cart.json'
import bookingEN from '../locales/en/booking.json'
import bookingAZ from '../locales/az/booking.json'
import tableEN from '../locales/en/table.json'
import tableAZ from '../locales/az/table.json'
import paymentEN from '../locales/en/payment.json'
import paymentAZ from '../locales/az/payment.json'
import profileEN from '../locales/en/profile.json'
import profileAZ from '../locales/az/profile.json'
import notificationsEN from '../locales/en/notifications.json'
import notificationsAZ from '../locales/az/notifications.json'
import mapEN from '../locales/en/map.json'
import mapAZ from '../locales/az/map.json'
import aiEN from '../locales/en/ai.json'
import aiAZ from '../locales/az/ai.json'

export const SUPPORTED_LANGS = ['en', 'az']
export const DEFAULT_LANG = 'en'

const resources = {
  en: {
    common: commonEN, nav: navEN, auth: authEN, feed: feedEN,
    restaurant: restaurantEN, menu: menuEN, cart: cartEN, booking: bookingEN,
    table: tableEN, payment: paymentEN, profile: profileEN,
    notifications: notificationsEN, map: mapEN, ai: aiEN,
  },
  az: {
    common: commonAZ, nav: navAZ, auth: authAZ, feed: feedAZ,
    restaurant: restaurantAZ, menu: menuAZ, cart: cartAZ, booking: bookingAZ,
    table: tableAZ, payment: paymentAZ, profile: profileAZ,
    notifications: notificationsAZ, map: mapAZ, ai: aiAZ,
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
