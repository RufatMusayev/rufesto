// Table states of the floor plan (tables.state) and what a guest can do at a table in each of them.
export const FLOOR_STATES = ['free', 'reserved', 'occupied', 'ordering', 'awaiting_payment', 'cleared', 'maintenance']

/** Unknown states are drawn as `cleared` (neutral). */
export const stateKey = state => (FLOOR_STATES.includes(state) ? state : 'cleared')

/** States in which a guest may still sit down (free table, or join an occupied one). */
export const SEATABLE_STATES = ['free', 'occupied', 'ordering']

/** States for which floor_plan() reports `occupied_seats`; a table in one of them with no seat listed is in use without chairs. */
export const IN_USE_STATES = ['occupied', 'ordering', 'awaiting_payment']
