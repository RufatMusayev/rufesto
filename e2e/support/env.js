// Loads e2e/.env (tiny parser, no dependency) and exposes the suite's settings.
const fs = require('fs')
const path = require('path')

function loadDotEnv(file) {
  let raw
  try { raw = fs.readFileSync(file, 'utf8') } catch { return }
  for (const line of raw.split(/\r?\n/)) {
    if (line.trim().startsWith('#')) continue
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/)
    if (!m) continue
    const value = m[2].replace(/^(['"])(.*)\1$/, '$2')
    if (process.env[m[1]] === undefined || process.env[m[1]] === '') process.env[m[1]] = value
  }
}
loadDotEnv(path.join(__dirname, '..', '.env'))

const strip = u => u.replace(/\/+$/, '')
const pair = prefix => {
  const email = process.env[`${prefix}_EMAIL`]
  const password = process.env[`${prefix}_PASSWORD`]
  return email && password ? { email, password } : null
}

/**
 * A review account (docs/REVIEW-ACCOUNTS.md, preview only). Credentials come from QA_REVIEW<n>_EMAIL / _PASSWORD,
 * or are read at run time from that git-excluded doc, so no password is ever copied into the suite.
 */
function reviewAccount(n) {
  const fromEnv = pair(`QA_REVIEW${n}`)
  if (fromEnv) return fromEnv
  let raw
  try { raw = fs.readFileSync(path.join(__dirname, '..', '..', 'docs', 'REVIEW-ACCOUNTS.md'), 'utf8') } catch { return null }
  const row = raw.split(/\r?\n/).map(l => l.split('|').map(c => c.trim())).find(c => c[1] === `review${n}@rufesto.test`)
  return row && row[2] ? { email: row[1], password: row[2] } : null
}

module.exports = {
  CONSUMER_URL: strip(process.env.CONSUMER_URL || 'https://rufat-server.com'),
  RESTO_URL: strip(process.env.RESTO_URL || 'https://resto.rufat-server.com'),
  creds: {
    guest: pair('QA_GUEST'),
    manager: pair('QA_MANAGER'),
    waiter: pair('QA_WAITER'),
    kitchen: pair('QA_KITCHEN'),
    review1: reviewAccount(1),   // Aysel R.: friends with review2 + review3, pending request from review4
  },
  supabaseOverride: process.env.QA_SUPABASE_URL && process.env.QA_SUPABASE_ANON_KEY
    ? { url: strip(process.env.QA_SUPABASE_URL), anonKey: process.env.QA_SUPABASE_ANON_KEY }
    : null,
  tableCode: process.env.QA_TABLE_CODE || '',
  kitchenLockdownDeployed: process.env.QA_KITCHEN_LOCKDOWN_DEPLOYED === '1',
}
