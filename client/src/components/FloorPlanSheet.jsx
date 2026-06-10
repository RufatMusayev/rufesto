import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { TABLE_COLORS } from '@shared/constants'

// Canvas units must match sql/21_table_floor_positions.sql seeding
const CANVAS_W = 100
const CANVAS_H = 64
const ZONE_PAD = 3.5

const LEGEND_STATES = ['free', 'reserved', 'occupied', 'awaiting_payment']

function chairPositions(t) {
  const cap = Math.min(t.capacity, 8)
  const cx = t.pos_x + t.pos_w / 2
  const cy = t.pos_y + t.pos_h / 2
  if (t.shape === 'round') {
    const r = Math.max(t.pos_w, t.pos_h) / 2 + 1.7
    return Array.from({ length: cap }, (_, i) => {
      const a = (i / cap) * Math.PI * 2 - Math.PI / 2
      return { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r }
    })
  }
  // square / rect — split between top and bottom edges
  const top = Math.ceil(cap / 2)
  const bottom = cap - top
  const row = (n, y) => Array.from({ length: n }, (_, i) => ({
    x: t.pos_x + (t.pos_w * (i + 1)) / (n + 1),
    y,
  }))
  return [
    ...row(top, t.pos_y - 1.8),
    ...row(bottom, t.pos_y + t.pos_h + 1.8),
  ]
}

function TableShape({ t, selected, onSelect }) {
  const style = TABLE_COLORS[t.state] || TABLE_COLORS.cleared
  const isFree = t.state === 'free'
  const cx = t.pos_x + t.pos_w / 2
  const cy = t.pos_y + t.pos_h / 2

  return (
    <g
      onClick={() => isFree && onSelect(t)}
      style={{
        cursor: isFree ? 'pointer' : 'default',
        opacity: isFree || selected ? 1 : 0.55,
        transition: 'opacity 0.18s var(--ease-out)',
      }}
    >
      {/* chairs */}
      {chairPositions(t).map((c, i) => (
        <circle key={i} cx={c.x} cy={c.y} r="0.9" fill="var(--t4)" opacity="0.45" />
      ))}

      {/* selection ring */}
      {selected && (
        t.shape === 'round' ? (
          <circle cx={cx} cy={cy} r={Math.max(t.pos_w, t.pos_h) / 2 + 1.1}
            fill="none" stroke="var(--gold)" strokeWidth="0.7" opacity="0.9" />
        ) : (
          <rect x={t.pos_x - 1.1} y={t.pos_y - 1.1} width={t.pos_w + 2.2} height={t.pos_h + 2.2}
            rx="2.4" fill="none" stroke="var(--gold)" strokeWidth="0.7" opacity="0.9" />
        )
      )}

      {/* table body */}
      {t.shape === 'round' ? (
        <circle cx={cx} cy={cy} r={Math.max(t.pos_w, t.pos_h) / 2}
          fill={style.bg} stroke={selected ? 'var(--gold)' : style.color}
          strokeWidth={selected ? 0.6 : 0.45} />
      ) : (
        <rect x={t.pos_x} y={t.pos_y} width={t.pos_w} height={t.pos_h}
          rx={t.shape === 'rect' ? 2.6 : 1.8}
          fill={style.bg} stroke={selected ? 'var(--gold)' : style.color}
          strokeWidth={selected ? 0.6 : 0.45} />
      )}

      {/* label */}
      <text x={cx} y={cy - 0.4} textAnchor="middle"
        style={{ fontFamily: "'DM Mono', monospace", fontWeight: 700 }}
        fontSize="2.9" fill={style.color}>
        {t.table_number}
      </text>
      <text x={cx} y={cy + 2.6} textAnchor="middle"
        style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500 }}
        fontSize="1.9" fill="var(--t3)">
        {t.capacity} seats
      </text>
    </g>
  )
}

export default function FloorPlanSheet({ restaurant, onClose, onReserve }) {
  const [tables, setTables] = useState([])
  const [selected, setSelected] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    supabase
      .from('tables')
      .select('*, sections(name)')
      .eq('restaurant_id', restaurant.id)
      .eq('is_active', true)
      .not('pos_x', 'is', null)
      .then(({ data }) => {
        if (!cancelled) { setTables(data || []); setLoading(false) }
      })

    const channel = supabase
      .channel(`floorplan-${restaurant.id}`)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'tables',
        filter: `restaurant_id=eq.${restaurant.id}`,
      }, payload => {
        setTables(prev => prev.map(t => t.id === payload.new.id ? { ...t, ...payload.new } : t))
        setSelected(prev => prev && prev.id === payload.new.id && payload.new.state !== 'free' ? null : prev)
      })
      .subscribe()

    return () => { cancelled = true; supabase.removeChannel(channel) }
  }, [restaurant.id])

  const zones = useMemo(() => {
    const bySection = {}
    for (const t of tables) {
      const name = t.sections?.name || 'Floor'
      if (!bySection[name]) bySection[name] = []
      bySection[name].push(t)
    }
    return Object.entries(bySection).map(([name, list]) => {
      const x1 = Math.min(...list.map(t => t.pos_x)) - ZONE_PAD
      const y1 = Math.min(...list.map(t => t.pos_y)) - ZONE_PAD - 1.5
      const x2 = Math.max(...list.map(t => t.pos_x + t.pos_w)) + ZONE_PAD
      const y2 = Math.max(...list.map(t => t.pos_y + t.pos_h)) + ZONE_PAD
      return { name, x: x1, y: y1, w: x2 - x1, h: y2 - y1 }
    })
  }, [tables])

  const presentStates = useMemo(
    () => LEGEND_STATES.filter(s => s === 'free' || tables.some(t => t.state === s)),
    [tables]
  )

  return (
    <div className="overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="sheet" style={{ maxHeight: '88vh', display: 'flex', flexDirection: 'column' }}>
        <div className="sheet-handle" />

        {/* Header */}
        <div style={{
          padding: '6px 18px 12px',
          display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <h2 style={{
                fontFamily: "'Playfair Display', Georgia, serif",
                fontSize: '1.2rem', fontWeight: 700, color: 'var(--t1)', lineHeight: 1.2,
              }}>
                Floor Plan
              </h2>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <span className="avail-pulse" style={{
                  width: 7, height: 7, borderRadius: '50%',
                  background: 'var(--sage)', display: 'inline-block',
                }} />
                <span style={{ fontSize: '0.62rem', fontWeight: 700, color: 'var(--sage)', letterSpacing: 0.6, textTransform: 'uppercase' }}>
                  Live
                </span>
              </span>
            </div>
            <p style={{ fontSize: '0.74rem', color: 'var(--t3)', fontWeight: 500, marginTop: 3 }}>
              {restaurant.name} · tap a free table to reserve
            </p>
          </div>
          <button onClick={onClose} className="icon-btn" style={{ width: 30, height: 30, color: 'var(--t2)' }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" style={{ width: 16, height: 16 }}>
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Legend */}
        <div className="no-scrollbar" style={{
          display: 'flex', gap: 6, padding: '0 18px 12px', overflowX: 'auto',
        }}>
          {presentStates.map(s => {
            const st = TABLE_COLORS[s]
            return (
              <span key={s} style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                padding: '4px 10px', borderRadius: 20, flexShrink: 0,
                background: st.bg, border: `1px solid ${st.border}`,
                fontSize: '0.66rem', fontWeight: 600, color: st.color,
              }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: st.color, display: 'inline-block' }} />
                {st.label}
              </span>
            )
          })}
        </div>

        {/* Floor */}
        <div style={{ padding: '0 14px', overflowY: 'auto' }}>
          {loading ? (
            <div style={{
              height: 220, borderRadius: 16, background: 'var(--s2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <span className="spinner" />
            </div>
          ) : tables.length === 0 ? (
            <div style={{
              height: 180, borderRadius: 16, background: 'var(--s2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'var(--t3)', fontSize: '0.8rem',
            }}>
              No floor plan available yet
            </div>
          ) : (
            <div style={{
              borderRadius: 16, border: '1px solid var(--border)',
              background: 'var(--s1)', overflow: 'hidden',
            }}>
              <svg viewBox={`0 0 ${CANVAS_W} ${CANVAS_H}`} style={{ width: '100%', display: 'block' }}>
                <defs>
                  <pattern id="floor-grid" width="5" height="5" patternUnits="userSpaceOnUse">
                    <circle cx="0.5" cy="0.5" r="0.22" fill="var(--t4)" opacity="0.18" />
                  </pattern>
                </defs>
                <rect x="0" y="0" width={CANVAS_W} height={CANVAS_H} fill="url(#floor-grid)" />

                {/* section zones */}
                {zones.map(z => (
                  <g key={z.name}>
                    <rect x={z.x} y={z.y} width={z.w} height={z.h} rx="2.8"
                      fill="var(--s2)" stroke="var(--border)" strokeWidth="0.25" />
                    <text x={z.x + 2} y={z.y + 3.1}
                      style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, letterSpacing: 0.5 }}
                      fontSize="2.1" fill="var(--t3)">
                      {z.name.toUpperCase()}
                    </text>
                  </g>
                ))}

                {/* entrance marker */}
                <g>
                  <line x1="44" y1={CANVAS_H - 1} x2="52" y2={CANVAS_H - 1}
                    stroke="var(--t3)" strokeWidth="0.7" strokeLinecap="round" />
                  <path d={`M 52 ${CANVAS_H - 1} A 8 8 0 0 0 44 ${CANVAS_H - 9}`}
                    fill="none" stroke="var(--t4)" strokeWidth="0.3" strokeDasharray="0.9 0.9" />
                  <text x="48" y={CANVAS_H - 2.6} textAnchor="middle"
                    style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, letterSpacing: 0.8 }}
                    fontSize="1.8" fill="var(--t3)">
                    ENTRANCE
                  </text>
                </g>

                {tables.map(t => (
                  <TableShape key={t.id} t={t}
                    selected={selected?.id === t.id}
                    onSelect={tbl => setSelected(prev => prev?.id === tbl.id ? null : tbl)} />
                ))}
              </svg>
            </div>
          )}
        </div>

        {/* Action bar */}
        <div style={{ padding: '12px 18px 18px' }}>
          {selected ? (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 12,
              background: 'var(--s2)', border: '1px solid var(--border)',
              borderRadius: 14, padding: '10px 12px 10px 16px',
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontFamily: "'DM Mono', monospace", fontSize: '0.92rem',
                  fontWeight: 700, color: 'var(--t1)',
                }}>
                  Table {selected.table_number}
                </div>
                <div style={{ fontSize: '0.7rem', color: 'var(--t3)', marginTop: 1 }}>
                  {selected.sections?.name || 'Floor'} · up to {selected.capacity} guests
                </div>
              </div>
              <button
                className="btn btn-primary"
                style={{ padding: '9px 18px', fontSize: '0.8rem', fontWeight: 700, borderRadius: 11, flexShrink: 0 }}
                onClick={() => onReserve(selected)}
              >
                Reserve this table
              </button>
            </div>
          ) : (
            <p style={{ textAlign: 'center', fontSize: '0.72rem', color: 'var(--t4)', padding: '6px 0' }}>
              Green tables are free right now — tap one to pick your spot
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
