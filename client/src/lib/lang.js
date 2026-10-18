// The app languages and what depends on them that i18next does not do: the BCP 47 tag for Intl, and the text a row of the
// database carries in more than one language (dishes.name_i18n / desc_i18n, menu_sections.name_i18n: jsonb { az, en, ru }).
export const LANGS = ['az', 'en', 'ru']

/** 'az' | 'en' | 'ru' for any i18n.language value ('ru-RU', 'en-GB', undefined ...); English for anything else. */
export const langOf = lng => {
  const l = String(lng || 'en').slice(0, 2).toLowerCase()
  return LANGS.includes(l) ? l : 'en'
}

const TAGS = { az: 'az-AZ', en: 'en-GB', ru: 'ru-RU' }

/** BCP 47 tag of the app language, for toLocale*String / Intl. */
export const localeTag = lng => TAGS[langOf(lng)]

/** The decimal separator of the app language ('4.5' in az / en, '4,5' in ru). */
export const decimalMark = lng => (langOf(lng) === 'ru' ? ',' : '.')

const text = v => (typeof v === 'string' && v.trim() ? v : '')

/**
 * The text to show in `lng`: map[lng] (the *_i18n column), else the Azerbaijani column for az (name_az, kept for rows the
 * i18n column does not cover yet), else the English entry of the map, else the canonical text (`name`). Always a string.
 *   pickText(d.name_i18n, lang, d.name_az, d.name)
 */
export function pickText(map, lng, azColumn, base) {
  const l = langOf(lng)
  const obj = map && typeof map === 'object' && !Array.isArray(map) ? map : null
  const own = obj ? text(obj[l]) : ''
  if (own) return own
  if (l === 'az' && text(azColumn)) return azColumn
  const en = obj ? text(obj.en) : ''
  if (en) return en
  return base == null ? '' : String(base)
}

/** Every language variant of a *_i18n map plus the plain columns: what a text search matches against. */
export const allTexts = (map, ...plain) =>
  [...plain, ...(map && typeof map === 'object' ? Object.values(map) : [])].filter(v => typeof v === 'string' && v)

/**
 * Name of a dish (or menu section) in `lng`, whatever shape it has: a raw row (name, name_az, name_i18n) or a view-model
 * (name, nameAz, nameI18n).
 */
export const nameIn = (o, lng) => (o
  ? pickText(o.name_i18n || o.nameI18n, lng, o.name_az || o.nameAz, o.name)
  : '')

/** Description of a dish in `lng` (raw row or view-model); '' when there is none. */
export const descIn = (o, lng) => (o
  ? pickText(o.desc_i18n || o.descI18n, lng, o.description_az || o.descriptionAz, o.description)
  : '')
