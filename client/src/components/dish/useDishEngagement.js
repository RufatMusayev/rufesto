import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { tap } from '../../lib/haptics'

/**
 * Like and save of one dish for the signed-in guest (likes / saved_dishes, as before the redesign). A signed-out tap
 * calls `requireAuth()` (opens the sign-in sheet) and changes nothing. `likeOnce` is the double-tap on the photo: it
 * likes if not liked yet and never unlikes. `burst` is a counter the photo watches to replay the like animation.
 */
export function useDishEngagement(dishId, userId, requireAuth) {
  const [liked, setLiked] = useState(false)
  const [count, setCount] = useState(0)
  const [saved, setSaved] = useState(false)
  const [burst, setBurst] = useState(0)
  const busy = useRef(false)

  useEffect(() => {
    let alive = true
    setLiked(false); setSaved(false)
    supabase.from('likes').select('id', { count: 'exact', head: true }).eq('target_type', 'dish').eq('target_id', dishId)
      .then(({ count: n }) => { if (alive) setCount(n || 0) })
    if (userId) {
      supabase.from('saved_dishes').select('id').eq('user_id', userId).eq('dish_id', dishId).maybeSingle()
        .then(({ data }) => { if (alive) setSaved(!!data) })
      supabase.from('likes').select('id').eq('user_id', userId).eq('target_type', 'dish').eq('target_id', dishId).maybeSingle()
        .then(({ data }) => { if (alive) setLiked(!!data) })
    }
    return () => { alive = false }
  }, [dishId, userId])

  const setLike = useCallback(async next => {
    if (busy.current) return
    busy.current = true
    setLiked(next)
    setCount(c => Math.max(0, c + (next ? 1 : -1)))
    if (next) tap(8)
    const undo = () => { setLiked(!next); setCount(c => Math.max(0, c + (next ? -1 : 1))) }
    try {
      const q = next
        ? supabase.from('likes').insert({ user_id: userId, target_type: 'dish', target_id: dishId })
        : supabase.from('likes').delete().eq('user_id', userId).eq('target_type', 'dish').eq('target_id', dishId)
      const { error } = await q
      if (error && error.code !== '23505') undo()
    } catch { undo() } finally { busy.current = false }
  }, [dishId, userId])

  const toggleLike = useCallback(() => {
    if (!requireAuth()) return
    setLike(!liked)
  }, [requireAuth, setLike, liked])

  const likeOnce = useCallback(() => {
    if (!requireAuth()) return
    setBurst(n => n + 1)
    if (!liked) setLike(true)
  }, [requireAuth, setLike, liked])

  /** Resolves 'saved' | 'unsaved' | null (failed or signed out), so the caller can toast. */
  const toggleSave = useCallback(async () => {
    if (!requireAuth()) return null
    const next = !saved
    setSaved(next)
    try {
      const { error } = next
        ? await supabase.from('saved_dishes').upsert({ user_id: userId, dish_id: dishId }, { onConflict: 'user_id,dish_id' })
        : await supabase.from('saved_dishes').delete().eq('user_id', userId).eq('dish_id', dishId)
      if (error) { setSaved(!next); return null }
      return next ? 'saved' : 'unsaved'
    } catch { setSaved(!next); return null }
  }, [requireAuth, saved, userId, dishId])

  return { liked, count, saved, burst, toggleLike, likeOnce, toggleSave }
}
