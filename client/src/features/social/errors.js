// Backend error codes (RAISE EXCEPTION 'code' in the v2 RPCs) -> i18n keys in the `social`
// namespace. Raw error messages never reach the UI: every failure ends up as { code, key }.
const KNOWN = [
  'not_authenticated', 'invalid_user', 'user_not_found', 'too_many_requests', 'already_friends',
  'request_exists', 'blocked', 'not_allowed', 'request_not_found',
  'restaurant_not_found', 'dish_not_found', 'visit_not_found', 'empty_post', 'invalid_photo_url',
  'caption_too_long', 'invalid_visibility', 'too_many_posts', 'post_not_found',
  'empty_comment', 'comment_too_long', 'too_many_comments', 'comment_not_found',
  // raised by this feature itself
  'photo_disabled', 'photo_too_large', 'not_an_image', 'upload_failed', 'restaurant_required',
]

const make = code => ({ code, key: `social:errors.${code}` })

/** Map anything thrown or returned by supabase-js to { code, key }. */
export function toError(err) {
  if (!err) return make('generic')
  const message = String(err.message || '').trim()

  if (KNOWN.includes(message)) return make(message)
  for (const code of KNOWN) {
    if (new RegExp(`(^|[^a-z_])${code}($|[^a-z_])`).test(message)) return make(code)
  }

  const text = `${message} ${err.details || ''} ${err.hint || ''}`
  // RPC / table not deployed yet (PostgREST 404 / PGRST202 / undefined function or table)
  if (['PGRST202', 'PGRST205', '42883', '42P01'].includes(err.code) || err.status === 404
      || /could not find the (function|table)|schema cache/i.test(text)) {
    return make('unavailable')
  }
  if (err.code === '42501' || /permission denied|row-level security|jwt/i.test(text)) return make('not_allowed')
  if (err.name === 'TypeError' || /failed to fetch|networkerror|network request|load failed|timeout/i.test(text)) {
    return make('network')
  }
  return make('generic')
}

