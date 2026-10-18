#!/usr/bin/env node
// Key-set check for client/src/locales: every language must have the same files and the same keys as `en`.
//   node scripts/i18n-check.mjs        (exit 1 on any difference)
//
// - Files: the namespaces (one json per namespace) must be identical across languages.
// - Keys: nested objects are flattened to dotted paths; arrays (month names ...) must have the same length.
// - Plurals: i18next suffixes _one/_few/_many/_other are compared by their base key; each language must carry
//   exactly the categories Intl.PluralRules gives for it (en/az: one + other; ru: one + few + many + other).
// - Interpolation: every {{var}} and <tag> of the en text must appear in the translation (plural forms may
//   leave out {{count}} in the "one" form, as en does: "One friend can join").
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const LOCALES = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'locales')
const BASE = 'en'
const LANGS = ['az', 'ru']
const PLURAL_RE = /^(.*)_(zero|one|two|few|many|other)$/
// _two / _zero are real keys in notifications.json (who_two), not CLDR categories, unless the base also has _one/_other
const CLDR = ['one', 'few', 'many', 'other']

const problems = []
const bad = (msg) => problems.push(msg)

const readJson = (lang, file) => JSON.parse(readFileSync(join(LOCALES, lang, file), 'utf8'))
const files = lang => (existsSync(join(LOCALES, lang)) ? readdirSync(join(LOCALES, lang)).filter(f => f.endsWith('.json')).sort() : [])

/** { 'a.b.c': 'text', 'list': ['x','y'] } leaves (arrays stay one leaf) */
function flatten(obj, prefix = '', out = {}) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k
    if (v && typeof v === 'object' && !Array.isArray(v)) flatten(v, key, out)
    else out[key] = v
  }
  return out
}

const vars = s => new Set((String(s).match(/\{\{\s*[\w.]+\s*(?:,[^}]*)?\}\}/g) || []).map(x => x.replace(/\s+/g, '')))
const tags = s => new Set((String(s).match(/<\/?\w+[^>]*>/g) || []))
const diff = (a, b) => [...a].filter(x => !b.has(x))

/** Group flat keys: { baseKey -> { forms: {one: 'text'...}, plural: bool } } */
function group(flat) {
  const groups = new Map()
  for (const [key, val] of Object.entries(flat)) {
    const m = key.match(PLURAL_RE)
    // a key is plural when its base also has an _other/_one sibling (who_two alone is a plain key)
    if (m && (flat[`${m[1]}_other`] !== undefined || flat[`${m[1]}_one`] !== undefined) && CLDR.concat(['zero', 'two']).includes(m[2])) {
      const g = groups.get(m[1]) || { plural: true, forms: {} }
      g.forms[m[2]] = val
      groups.set(m[1], g)
    } else {
      groups.set(key, { plural: false, value: val })
    }
  }
  return groups
}

const baseFiles = files(BASE)
for (const lang of LANGS) {
  const have = files(lang)
  for (const f of baseFiles) if (!have.includes(f)) bad(`${lang}/${f}: file missing`)
  for (const f of have) if (!baseFiles.includes(f)) bad(`${lang}/${f}: extra file (not in ${BASE})`)
}

for (const f of baseFiles) {
  const baseGroups = group(flatten(readJson(BASE, f)))
  for (const lang of LANGS) {
    if (!files(lang).includes(f)) continue
    const where = `${lang}/${f}`
    const groups = group(flatten(readJson(lang, f)))
    const want = new Set(new Intl.PluralRules(lang).resolvedOptions().pluralCategories)

    for (const [key, bg] of baseGroups) {
      const g = groups.get(key)
      if (!g) { bad(`${where}: missing "${key}"`); continue }
      if (bg.plural !== g.plural) { bad(`${where}: "${key}" is ${bg.plural ? 'plural' : 'plain'} in ${BASE} but ${g.plural ? 'plural' : 'plain'} here`); continue }

      if (!bg.plural) {
        if (Array.isArray(bg.value)) {
          if (!Array.isArray(g.value) || g.value.length !== bg.value.length) bad(`${where}: "${key}" must be an array of ${bg.value.length}`)
          else g.value.forEach((x, i) => { if (typeof x !== 'string' || !x.trim()) bad(`${where}: "${key}[${i}]" is empty`) })
          continue
        }
        if (typeof g.value !== 'string') { bad(`${where}: "${key}" is not a string`); continue }
        if (bg.value !== '' && !g.value.trim()) bad(`${where}: "${key}" is empty`)
        const miss = diff(vars(bg.value), vars(g.value)); const extra = diff(vars(g.value), vars(bg.value))
        if (miss.length) bad(`${where}: "${key}" lacks ${miss.join(' ')}`)
        if (extra.length) bad(`${where}: "${key}" has unknown ${extra.join(' ')}`)
        const tm = diff(tags(bg.value), tags(g.value)); const te = diff(tags(g.value), tags(bg.value))
        if (tm.length || te.length) bad(`${where}: "${key}" tags differ (en: ${[...tags(bg.value)].join('') || '-'} / here: ${[...tags(g.value)].join('') || '-'})`)
      } else {
        // plural group: categories of this language, no more no less
        const have = Object.keys(g.forms)
        const enHas = Object.keys(bg.forms)
        const isCldrGroup = enHas.every(c => CLDR.includes(c))
        if (isCldrGroup) {
          for (const c of want) if (!have.includes(c)) bad(`${where}: "${key}" needs the _${c} form`)
          for (const c of have) if (!want.has(c)) bad(`${where}: "${key}" has _${c}, which ${lang} does not use`)
        } else {
          for (const c of enHas) if (!have.includes(c)) bad(`${where}: "${key}" missing _${c}`)
        }
        const allVars = new Set(Object.values(bg.forms).flatMap(t => [...vars(t)]))
        const otherVars = vars(bg.forms.other ?? '')
        for (const [c, text] of Object.entries(g.forms)) {
          if (typeof text !== 'string' || !text.trim()) { bad(`${where}: "${key}_${c}" is empty`); continue }
          const extra = diff(vars(text), allVars)
          if (extra.length) bad(`${where}: "${key}_${c}" has unknown ${extra.join(' ')}`)
          // the many/other (and few) forms are shown with larger numbers: they must carry what en's "other" carries
          if (c !== 'one') { const miss = diff(otherVars, vars(text)); if (miss.length) bad(`${where}: "${key}_${c}" lacks ${miss.join(' ')}`) }
        }
        const allTags = new Set(Object.values(bg.forms).flatMap(t => [...tags(t)]))
        for (const [c, text] of Object.entries(g.forms)) {
          const extra = diff(tags(text), allTags)
          if (extra.length) bad(`${where}: "${key}_${c}" has unknown tag ${extra.join(' ')}`)
        }
      }
    }
    for (const key of groups.keys()) if (!baseGroups.has(key)) bad(`${where}: extra "${key}" (not in ${BASE})`)
  }
}

// Cyrillic must not leak into the other languages, and ru must not be left as copied English text.
const ru = (() => { try { return files('ru') } catch { return [] } })()
let untranslated = 0
for (const f of ru) {
  const en = flatten(readJson(BASE, f)); const r = flatten(readJson('ru', f))
  for (const [k, v] of Object.entries(r)) {
    if (typeof v !== 'string' || /[А-Яа-яЁё]/.test(v)) continue
    if (!/[A-Za-z]{4,}/.test(v.replace(/\{\{[^}]*\}\}/g, '').replace(/<[^>]*>/g, ''))) continue   // only placeholders / symbols
    if (en[k] === v) { untranslated++; if (process.argv.includes('--verbose')) console.warn(`ru/${f}: "${k}" looks untranslated: ${v}`) }
  }
}

if (problems.length) {
  console.error(`i18n-check: ${problems.length} problem(s)`)
  for (const p of problems) console.error('  - ' + p)
  process.exit(1)
}
const total = baseFiles.reduce((n, f) => n + Object.keys(flatten(readJson(BASE, f))).length, 0)
console.log(`i18n-check: OK. ${baseFiles.length} namespaces, ${total} leaf keys; ${[BASE, ...LANGS].join(' / ')} match.`)
if (untranslated) console.log(`  note: ${untranslated} ru value(s) are identical to en and have no Cyrillic (brand names, codes?) - run with --verbose to list`)
