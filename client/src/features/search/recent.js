// Recent searches: kept on this device only (localStorage), never sent anywhere. Max 8, newest first, de-duplicated
// on the folded text. Saved on Enter or when a result is tapped.
import { fold } from './fold'

const KEY = 'rufesto_recent_searches'
const MAX = 8

export function getRecent() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '[]')
    return Array.isArray(raw) ? raw.filter(v => typeof v === 'string' && v.trim()).slice(0, MAX) : []
  } catch { return [] }
}

function write(list) {
  try { localStorage.setItem(KEY, JSON.stringify(list)) } catch { /* storage blocked */ }
  return list
}

/** Adds `q` on top; returns the new list. Queries shorter than 2 letters are not worth remembering. */
export function addRecent(q) {
  const text = String(q || '').trim().slice(0, 60)
  if (text.length < 2) return getRecent()
  const folded = fold(text)
  return write([text, ...getRecent().filter(v => fold(v) !== folded)].slice(0, MAX))
}

export const removeRecent = q => write(getRecent().filter(v => v !== q))
export const clearRecent = () => write([])
