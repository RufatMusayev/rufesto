// Accent-insensitive text helpers of Search (moved from pages/exploreSearch.js). The server folds the same way
// (sql/66), so a local match and a server match agree: "dönər" == "doner", "Şirvan" == "sirvan", "Tiramisù" == "tiramisu".

// the Unicode combining diacritical marks (U+0300 to U+036F)
const MARKS = /[\u0300-\u036f]/g

const foldChar = ch => ch.toLowerCase().replace(/ə/g, 'e').replace(/ı/g, 'i').normalize('NFD').replace(MARKS, '')

/** lower case, accents removed, Azerbaijani letters folded. */
export function fold(s) {
  return String(s ?? '').toLowerCase().replace(/ə/g, 'e').replace(/ı/g, 'i').normalize('NFD').replace(MARKS, '')
}

/** True when `hay` contains the folded `needle` (needle must already be folded). */
export const has = (hay, needle) => !!hay && fold(hay).includes(needle)

/**
 * Splits `text` into [{ t, hit }] around the first place where the folded query occurs, so the match can be set
 * in a heavier weight. The folded text can be shorter or longer than the original (combining marks), so each
 * folded character remembers the original index it came from.
 */
export function highlight(text, q) {
  const src = String(text ?? '')
  const needle = fold(q).trim()
  if (!needle || !src) return [{ t: src, hit: false }]
  let folded = ''
  const origin = []
  for (let i = 0; i < src.length; i++) {
    const f = foldChar(src[i])
    for (let j = 0; j < f.length; j++) { folded += f[j]; origin.push(i) }
  }
  const at = folded.indexOf(needle)
  if (at < 0) return [{ t: src, hit: false }]
  const start = origin[at]
  const end = origin[at + needle.length - 1] + 1
  return [
    start > 0 ? { t: src.slice(0, start), hit: false } : null,
    { t: src.slice(start, end), hit: true },
    end < src.length ? { t: src.slice(end), hit: false } : null,
  ].filter(Boolean)
}
