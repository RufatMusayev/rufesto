import { FloorSheet } from '../features/floor/mounts'

// The guest's floor plan (opened by the floor icon on the restaurant page). The implementation, styles and
// the `floor` i18n namespace live in features/floor; this wrapper only keeps the old import path and props:
//   restaurant   { id, name, ... }
//   onClose()
//   onReserve(table)   table = { id, table_number, capacity, state, sections: { name } }
export default function FloorPlanSheet(props) {
  return <FloorSheet {...props} />
}
