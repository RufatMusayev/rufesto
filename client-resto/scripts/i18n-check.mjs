#!/usr/bin/env node
// Locale key-diff for client-resto. Run: `npm run i18n:check` (or `node scripts/i18n-check.mjs`).
//
// en is the source of truth. Every other language folder in src/locales must have, per namespace file:
//   - every key of en (plural groups are compared per language: en has _one/_other, ru needs _one/_few/_many/_other),
//   - the same {{placeholders}} and the same <tags> as en (a plural form may drop {{count}}, e.g. "один заказ"),
//   - no empty values.
// It also checks that src/lib/i18n.js imports every locale file, so a new namespace is not forgotten.
// Keys that exist only in a translation are reported as warnings. Exit code 1 when anything is missing or wrong.

import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const LOCALES = join(ROOT, 'src', 'locales')
const I18N_JS = join(ROOT, 'src', 'lib', 'i18n.js')
const BASE = 'en'
const PLURAL_SUFFIXES = ['zero', 'one', 'two', 'few', 'many', 'other']

const errors = []
const warnings = []
const fail = msg => errors.push(msg)
const warn = msg => warnings.push(msg)

function flatten(obj, prefix = '', out = {}) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k
    if (v && typeof v === 'object' && !Array.isArray(v)) flatten(v, key, out)
    else out[key] = v
  }
  return out
}

function load(lang, file) {
  const path = join(LOCALES, lang, file)
  try {
    return flatten(JSON.parse(readFileSync(path, 'utf8')))
  } catch (e) {
    fail(`${lang}/${file}: cannot parse JSON (${e.message})`)
    return null
  }
}

const placeholders = s => new Set([...String(s).matchAll(/\{\{\s*([\w.]+)\s*\}\}/g)].map(m => m[1]))
const tags = s => [...String(s).matchAll(/<\/?\s*([a-zA-Z][\w-]*)[^>]*>/g)].map(m => m[0].replace(/\s+/g, ' ')).sort().join('|')

/** { base: Set(suffixes) } for every plural group of the base language (a group always has _other). */
function pluralGroups(keys) {
  const set = new Set(keys)
  const groups = new Map()
  for (const key of keys) {
    const m = key.match(/^(.*)_(zero|one|two|few|many|other)$/)
    if (m && set.has(`${m[1]}_other`)) {
      if (!groups.has(m[1])) groups.set(m[1], new Set())
      groups.get(m[1]).add(m[2])
    }
  }
  return groups
}

/** The keys language `lang` must define, given the base keys. Plural groups follow the language's own categories. */
function expectedKeys(baseKeys, lang) {
  const groups = pluralGroups(baseKeys)
  const cats = new Intl.PluralRules(lang).resolvedOptions().pluralCategories.filter(c => PLURAL_SUFFIXES.includes(c))
  const out = new Map() // expected key -> base key to compare placeholders with
  for (const key of baseKeys) {
    const m = key.match(/^(.*)_(zero|one|two|few|many|other)$/)
    if (m && groups.has(m[1])) continue
    out.set(key, { baseKey: key, plural: false })
  }
  for (const base of groups.keys()) {
    for (const c of cats) out.set(`${base}_${c}`, { baseKey: `${base}_other`, plural: true })
  }
  return out
}

const dirs = readdirSync(LOCALES).filter(d => statSync(join(LOCALES, d)).isDirectory())
if (!dirs.includes(BASE)) {
  console.error(`i18n-check: base language folder "${BASE}" not found in ${LOCALES}`)
  process.exit(1)
}
const langs = dirs.filter(d => d !== BASE).sort()
const baseFiles = readdirSync(join(LOCALES, BASE)).filter(f => f.endsWith('.json')).sort()

// Which files i18n.js imports.
const i18nSource = existsSync(I18N_JS) ? readFileSync(I18N_JS, 'utf8') : ''
const imported = new Set([...i18nSource.matchAll(/locales\/([\w-]+)\/([\w-]+\.json)/g)].map(m => `${m[1]}/${m[2]}`))
for (const lang of dirs) {
  for (const file of readdirSync(join(LOCALES, lang)).filter(f => f.endsWith('.json'))) {
    if (!imported.has(`${lang}/${file}`)) fail(`${lang}/${file}: not imported in src/lib/i18n.js`)
  }
}

let checkedKeys = 0
for (const file of baseFiles) {
  const base = load(BASE, file)
  if (!base) continue
  const baseKeys = Object.keys(base)
  for (const [k, v] of Object.entries(base)) if (typeof v !== 'string' || v === '') fail(`${BASE}/${file}: "${k}" is empty or not a string`)

  for (const lang of langs) {
    if (!existsSync(join(LOCALES, lang, file))) {
      fail(`${lang}/${file}: file is missing`)
      continue
    }
    const tr = load(lang, file)
    if (!tr) continue
    const expected = expectedKeys(baseKeys, lang)
    checkedKeys += expected.size

    for (const [key, info] of expected) {
      if (!(key in tr)) { fail(`${lang}/${file}: missing "${key}"`); continue }
      const value = tr[key]
      if (typeof value !== 'string' || value.trim() === '') { fail(`${lang}/${file}: "${key}" is empty`); continue }
      const want = placeholders(base[info.baseKey])
      const got = placeholders(value)
      const unknown = [...got].filter(p => !want.has(p))
      const lost = [...want].filter(p => !got.has(p))
      if (unknown.length) fail(`${lang}/${file}: "${key}" uses unknown placeholder(s) ${unknown.map(p => `{{${p}}}`).join(', ')}`)
      if (lost.length && !(info.plural && lost.every(p => p === 'count'))) {
        fail(`${lang}/${file}: "${key}" lost placeholder(s) ${lost.map(p => `{{${p}}}`).join(', ')}`)
      }
      if (tags(base[info.baseKey]) !== tags(value)) fail(`${lang}/${file}: "${key}" has different tags than ${BASE}`)
    }
    for (const key of Object.keys(tr)) if (!expected.has(key)) warn(`${lang}/${file}: "${key}" is not in ${BASE} (stale or wrong plural form)`)
  }
}

for (const lang of langs) {
  for (const file of readdirSync(join(LOCALES, lang)).filter(f => f.endsWith('.json'))) {
    if (!baseFiles.includes(file)) warn(`${lang}/${file}: no ${BASE} counterpart`)
  }
}

for (const w of warnings) console.warn(`warn  ${w}`)
for (const e of errors) console.error(`FAIL  ${e}`)
console.log(`i18n-check: ${langs.length} language(s) [${langs.join(', ')}] vs ${BASE}, ${baseFiles.length} namespaces, ${checkedKeys} keys checked, ${errors.length} error(s), ${warnings.length} warning(s)`)
process.exit(errors.length ? 1 : 0)
