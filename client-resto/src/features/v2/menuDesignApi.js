// Supabase calls of the Settings "Menu design" card (V2-CONTRACT 19.3). Same shape as api.js: every
// function returns { data, error } and never throws. Kept apart from api.js (past its size budget).
//
// CONTRACT: restaurant_settings(menu_theme, menu_accent, menu_show_photos, menu_note) (sql/62) is
//           readable by staff and updatable by admin / manager of the restaurant (column-level
//           GRANT UPDATE + RLS, same as the booking rules); restaurants(id, slug) is public.

import { supabase } from '../../lib/supabase'
import { writeError } from '../../lib/errors'
import { isColumnMissing } from './errors'
import { DEFAULT_DESIGN, MENU_THEMES, toColumns } from './menuDesign'

async function run(fn) {
  try {
    const res = await fn()
    return { data: res?.data ?? null, error: res?.error ?? null }
  } catch (error) {
    return { data: null, error }
  }
}

/**
 * View-model: { theme, accent (string|null), showPhotos, note ('' when none), slug (string|null), ready }.
 * `ready: false` = the sql/62 columns aren't deployed yet: defaults are returned (no error) so the card
 * can show itself read-only instead of failing the Settings page.
 */
export async function fetchMenuDesign(restaurantId) {
  const [settings, rest] = await Promise.all([
    run(() => supabase.from('restaurant_settings')
      .select('menu_theme, menu_accent, menu_show_photos, menu_note')
      .eq('restaurant_id', restaurantId).maybeSingle()),
    run(() => supabase.from('restaurants').select('slug').eq('id', restaurantId).maybeSingle()),
  ])
  // A missing slug only hides the "Open live menu" link.
  const slug = rest.data?.slug || null

  if (settings.error) {
    if (isColumnMissing(settings.error)) return { data: { ...DEFAULT_DESIGN, slug, ready: false }, error: null }
    return { data: null, error: settings.error }
  }
  const s = settings.data || {}
  return {
    data: {
      theme: MENU_THEMES.includes(s.menu_theme) ? s.menu_theme : DEFAULT_DESIGN.theme,
      accent: s.menu_accent || null,
      showPhotos: s.menu_show_photos === true,
      note: s.menu_note || '',
      slug,
      ready: true,
    },
    error: null,
  }
}

/** Updates the four columns only (a manager may not UPDATE restaurant_id); inserts the row if it is missing. */
export async function saveMenuDesign(restaurantId, form) {
  const cols = toColumns(form)
  let res = await run(() => supabase.from('restaurant_settings')
    .update(cols).eq('restaurant_id', restaurantId).select('restaurant_id'))
  if (!res.error && (res.data || []).length === 0) {
    res = await run(() => supabase.from('restaurant_settings')
      .insert({ restaurant_id: restaurantId, ...cols }).select('restaurant_id'))
  }
  if (res.error) return res
  const error = writeError(res)
  return error ? { data: null, error } : { data: res.data, error: null }
}
