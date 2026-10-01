// Turns anything a Supabase call can hand back (PostgrestError, AuthError,
// StorageError, a thrown Error / TypeError from fetch, a raw JSON string, a
// plain object) into a readable, translated sentence. Raw `error.message`
// text must never reach the UI: storage errors in particular can carry a JSON
// body as their message, and a bare object stringifies to "[object Object]".

/** What a write returns when RLS hid the row: no error, zero rows updated. */
export const NO_ROWS_ERROR = { code: 'NO_ROWS', message: 'no rows affected' }

/**
 * Pass the result of `.update(...).eq(...).select('id')` (or delete). Returns
 * the Supabase error, NO_ROWS_ERROR if the write matched nothing (PostgREST
 * reports no error when RLS USING filters the row out), or null on success.
 */
export function writeError({ error, data }) {
  if (error) return error
  if (Array.isArray(data) && data.length === 0) return NO_ROWS_ERROR
  return null
}

// Exception codes the waiter / table RPCs raise (see sql/34); message == code.
const RPC_CODES = {
  not_open:    'waiterErrNotOpen',
  not_found:   'waiterErrNotFound',
  not_allowed: 'waiterErrNotAllowed',
}

const str = v => (typeof v === 'string' ? v : '')

function parseJsonObject(text) {
  const s = text.trim()
  if (!s.startsWith('{')) return null
  try {
    const o = JSON.parse(s)
    return o && typeof o === 'object' ? o : null
  } catch {
    return null
  }
}

function normalise(err) {
  if (!err) return { message: '', code: '', status: 0 }
  const src = typeof err === 'string' ? { message: err } : err
  let message = str(src.message) || str(src.error_description) || str(src.error)
  let code = str(src.code) || str(src.error_code)
  let status = Number(src.status ?? src.statusCode) || 0

  // Storage errors sometimes carry the HTTP body as the message.
  const body = parseJsonObject(message)
  if (body) {
    message = str(body.message) || str(body.error_description) || str(body.error)
    code = code || str(body.code)
    status = status || Number(body.status ?? body.statusCode) || 0
  }
  return { message: `${message} ${str(src.details)}`.trim().toLowerCase(), code, status }
}

/**
 * i18n key (in the `dashboard` namespace) for an error.
 *   fallback   key used when nothing more specific matches
 *   permission key used for permission / no-rows failures (e.g. 'errManagersOnly')
 */
export function friendlyErrorKey(err, { fallback = 'actionFailed', permission = 'errPermission' } = {}) {
  const { message, code, status } = normalise(err)

  if (code === 'NO_ROWS') return permission === 'errPermission' ? 'errNoChange' : permission
  if (RPC_CODES[message]) return RPC_CODES[message]

  if (/failed to fetch|networkerror|network request failed|load failed|fetch failed|timed out/.test(message)) return 'errNetwork'
  if (code === 'invalid_credentials' || /invalid login credentials/.test(message)) return 'errInvalidCredentials'
  if (status === 429 || code === 'over_request_rate_limit' || /rate limit|too many requests/.test(message)) return 'errRateLimited'
  if (code === 'PGRST301' || code === 'PGRST303' || /jwt/.test(message) || status === 401) return 'errSessionExpired'
  if (code === '42501' || status === 403 || /row-level security|permission denied|not authorized|unauthorized|forbidden/.test(message)) return permission
  if (/invalid table state transition/.test(message)) return 'errTableTransition'
  if (code === '23505') return 'errDuplicate'
  if (code === '23503') return 'errReferenced'
  if (['23502', '23514', '22P02', '22003', '22007', '22001'].includes(code)) return 'errInvalidData'
  if (code === 'PGRST116') return 'errNotFound'
  return fallback
}

/** Translated, user-safe message for an error. `t` is i18next's t function. */
export function friendlyError(err, t, opts) {
  return t(`dashboard:${friendlyErrorKey(err, opts)}`)
}
