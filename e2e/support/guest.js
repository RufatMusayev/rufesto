// Consumer sign-in for @guest specs.
// Production builds only offer email-code / OAuth sign-in (the password form is gated by
// import.meta.env.DEV), so we exchange email+password for a Supabase session over the
// public auth API and seed it into localStorage exactly where supabase-js keeps it.
const { CONSUMER_URL, supabaseOverride } = require('./env')

let discovered = null   // per worker process: the Supabase URL/key never change between tests

/** Supabase URL + public anon key, read from the consumer app's own requests. */
async function discoverSupabase(page) {
  if (supabaseOverride) return supabaseOverride
  if (discovered) return discovered
  let found = null
  page.on('request', req => {
    if (found || !/\/rest\/v1\//.test(req.url())) return
    const anonKey = req.headers()['apikey']
    if (anonKey) found = { url: new URL(req.url()).origin, anonKey }
  })
  await page.goto(CONSUMER_URL + '/')
  const deadline = Date.now() + 15_000
  while (!found && Date.now() < deadline) await page.waitForTimeout(200)
  if (!found) throw new Error('Could not find the Supabase URL/anon key in consumer traffic; set QA_SUPABASE_URL and QA_SUPABASE_ANON_KEY.')
  discovered = found
  return found
}

async function signInGuest(page, { email, password }) {
  const { url, anonKey } = await discoverSupabase(page)
  const res = await page.request.post(`${url}/auth/v1/token?grant_type=password`, {
    headers: { apikey: anonKey, 'Content-Type': 'application/json' },
    data: { email, password },
  })
  if (!res.ok()) {
    const body = await res.json().catch(() => ({}))
    throw new Error(`Guest sign-in failed: HTTP ${res.status()} ${body.error_code || body.error || ''}. Does the account have a password set?`)
  }
  const session = await res.json()
  const storageKey = `sb-${new URL(url).hostname.split('.')[0]}-auth-token`
  await page.context().addInitScript(([key, value]) => {
    try { if (!localStorage.getItem(key)) localStorage.setItem(key, value) } catch { /* storage blocked */ }
  }, [storageKey, JSON.stringify(session)])
  return { session, supabase: { url, anonKey } }
}

/** 'YYYY-MM-DD' for today + n days on the Baku calendar (the booking form works in Baku time). */
function bakuDate(offsetDays = 0) {
  const now = new Date(Date.now() + offsetDays * 86_400_000)
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Baku' }).format(now)
}

module.exports = { signInGuest, bakuDate }
