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

module.exports = {
  CONSUMER_URL: strip(process.env.CONSUMER_URL || 'https://rufat-server.com'),
  RESTO_URL: strip(process.env.RESTO_URL || 'https://resto.rufat-server.com'),
  creds: {
    guest: pair('QA_GUEST'),
    manager: pair('QA_MANAGER'),
    waiter: pair('QA_WAITER'),
    kitchen: pair('QA_KITCHEN'),
  },
  supabaseOverride: process.env.QA_SUPABASE_URL && process.env.QA_SUPABASE_ANON_KEY
    ? { url: strip(process.env.QA_SUPABASE_URL), anonKey: process.env.QA_SUPABASE_ANON_KEY }
    : null,
  kitchenLockdownDeployed: process.env.QA_KITCHEN_LOCKDOWN_DEPLOYED === '1',
}
