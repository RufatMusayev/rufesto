import { memo, useId } from 'react'
import { useTranslation } from 'react-i18next'
import { stateKey } from '../states'

const rectPath = (x, y, w, h) => `M${x} ${y}h${w}v${h}h${-w}z`

/** Pixel shapes of one table block (all coordinates are whole pixels): body, lit top face, top highlight. */
function blockShapes(x, y, w, h, c, round, edge, hl) {
  if (round) { // corners cut by one cell
    return {
      body: rectPath(x + c, y, w - 2 * c, h) + rectPath(x, y + c, w, h - 2 * c),
      face: rectPath(x + c, y, w - 2 * c, h - edge) + rectPath(x, y + c, w, h - 2 * c),
      high: rectPath(x + c, y, w - 2 * c, hl),
    }
  }
  return { body: rectPath(x, y, w, h), face: rectPath(x, y, w, h - edge), high: rectPath(x, y, w, hl) }
}

function Chair({ x, y, cell, mode, n, t }) {
  const inset = Math.max(1, Math.round(cell * 0.2))
  const size = cell - 2 * inset
  const label = mode === 'mine' ? t('seatNYou', { n }) : mode === 'taken' ? t('seatNTaken', { n }) : t('seatNFree', { n })
  return (
    <g className={`fl-chair is-${mode}`}>
      <title>{label}</title>
      <rect className="fl-chair-edge" x={x + inset} y={y + inset} width={size} height={size} />
      <rect className="fl-chair-fill" x={x + inset + 1} y={y + inset + 1} width={size - 2} height={size - 2} />
    </g>
  )
}

const TableBlock = memo(function TableBlock({ item, table, cell, selected, mySeatNo, isMine, stateLabel, onSelect, t }) {
  const key = stateKey(table.state)
  const x = item.col * cell
  const y = item.row * cell
  const w = item.bw * cell
  const h = item.bh * cell
  const edge = Math.max(2, Math.round(cell * 0.3))
  const { body, face, high } = blockShapes(x, y, w, h, cell, item.round, edge, Math.max(1, Math.round(cell * 0.15)))

  const label = table.number.slice(0, 6)
  const fontSize = Math.max(8, Math.min(Math.round(cell * 1.25), Math.floor((w - cell * 0.6) / (Math.max(label.length, 1) * 0.62))))

  const aria = t(table.seatInfo ? 'tableAria' : 'tableAriaNoSeats', {
    number: table.number, state: stateLabel, free: table.capacity - table.occupiedSeats.length, total: table.capacity,
  })
  const pick = () => onSelect(table.id)

  return (
    <g
      className={`fl-table fl-st fl-st-${key}${selected ? ' is-selected' : ''}`}
      role="button"
      tabIndex={0}
      aria-label={aria}
      aria-pressed={selected}
      onClick={pick}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick() } }}
    >
      <rect className="fl-hit" x={(item.col - 1) * cell} y={(item.row - 1) * cell} width={w + 2 * cell} height={h + 2 * cell} />
      {item.chairs.map(ch => {
        const taken = table.occupiedSeats.includes(ch.n)
        const mode = isMine && mySeatNo === ch.n ? 'mine' : taken ? 'taken' : 'free'
        return <Chair key={ch.n} x={ch.col * cell} y={ch.row * cell} cell={cell} mode={mode} n={ch.n} t={t} />
      })}
      <path className="fl-t-lo" d={body} />
      <path className="fl-t-face" d={face} />
      <path className="fl-t-hi" d={high} />
      <text className="fl-t-num" x={x + w / 2} y={y + (h - edge) / 2} dy="0.36em" textAnchor="middle" fontSize={fontSize}>
        {label}
      </text>
      {isMine && mySeatNo === null && <rect className="fl-you" x={x + w - cell} y={y} width={cell} height={cell} />}
      {selected && (
        <rect className="fl-select" x={(item.col - 1) * cell + 1} y={(item.row - 1) * cell + 1} width={w + 2 * cell - 2} height={h + 2 * cell - 2} />
      )}
    </g>
  )
})

/**
 * The pixel floor: an SVG of `layout.cols x layout.rows` square cells of `cell` px, drawn with crisp edges.
 * `tablesById` holds the live table data (state, occupied seats); `layout` only holds geometry, so a state or
 * seat change redraws colours without moving anything.
 */
export default function PixelFloor({ layout, tablesById, sectionNames, cell, selectedId, mine, label, entranceLabel, onSelect }) {
  const { t } = useTranslation('floor')
  const uid = useId().replace(/:/g, '')
  const width = layout.cols * cell
  const height = layout.rows * cell
  const labelSize = Math.max(8, Math.round(cell * 0.85))
  const { door } = layout
  const doorX = door.col * cell
  const doorW = door.w * cell

  return (
    <svg className="fl-canvas" width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="group" aria-label={label} shapeRendering="crispEdges">
      <defs>
        <pattern id={`${uid}-tile`} width={2 * cell} height={2 * cell} patternUnits="userSpaceOnUse">
          <rect className="fl-tile" width={cell} height={cell} />
          <rect className="fl-tile" x={cell} y={cell} width={cell} height={cell} />
        </pattern>
      </defs>
      <rect className="fl-floor" width={width} height={height} />
      <rect fill={`url(#${uid}-tile)`} width={width} height={height} />

      {layout.zones.map(z => (
        <g key={z.id || 'none'} aria-hidden="true">
          <rect className="fl-zone" x={z.col * cell + 1} y={z.row * cell + 1} width={z.w * cell - 2} height={z.h * cell - 2} />
          <text className="fl-zone-name" x={z.col * cell + cell} y={z.row * cell + cell / 2} dy="0.36em" fontSize={labelSize}>
            {(sectionNames.get(z.id) || '').toUpperCase()}
          </text>
        </g>
      ))}

      {/* walls with the entrance gap at the bottom */}
      <g aria-hidden="true">
        <rect className="fl-wall" x="0" y={door.row * cell} width={doorX} height={cell} />
        <rect className="fl-wall" x={doorX + doorW} y={door.row * cell} width={width - doorX - doorW} height={cell} />
        <rect className="fl-mat" x={doorX} y={door.row * cell + cell / 2} width={doorW} height={Math.ceil(cell / 2)} />
        <text className="fl-door-name" x={width / 2} y={door.row * cell - cell * 0.3} textAnchor="middle" fontSize={labelSize}>
          {entranceLabel}
        </text>
      </g>

      {layout.items.map(item => {
        const table = tablesById.get(item.id)
        if (!table) return null
        const key = stateKey(table.state)
        const isMine = !!mine && mine.tableId === item.id
        return (
          <TableBlock
            key={item.id}
            item={item}
            table={table}
            cell={cell}
            selected={selectedId === item.id}
            isMine={isMine}
            mySeatNo={isMine ? mine.seatNo : null}
            stateLabel={t(`state.${key}`)}
            onSelect={onSelect}
            t={t}
          />
        )
      })}
    </svg>
  )
}
