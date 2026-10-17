import { highlight } from '../fold'

/** Text with the part that matches the query in a heavier weight (rest stays in the row's muted colour). */
export default function Hl({ text, q }) {
  const parts = highlight(text, q)
  if (parts.length === 1 && !parts[0].hit) return text
  return parts.map((p, i) => (p.hit ? <b key={i} className="sr-hit">{p.t}</b> : <span key={i}>{p.t}</span>))
}
