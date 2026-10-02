// Backend row -> view-model mappers. Screens only ever see the shapes returned here, so a contract
// rename is a change in this file and api.js, never in a component.

const mapRestaurant = r => (r ? {
  id: r.id || null,
  name: r.name || '',
  slug: r.slug || null,
  cover: r.cover_photo || null,
  address: r.address || null,
  cuisine: r.cuisine_type || null,
} : null)

/** A restaurant row from rsrc() (public columns). */
export const mapRestaurantRow = mapRestaurant

/** get_available_slots -> [{ time 'HH:MM', available, reason, tablesFree }] */
export const mapSlot = s => ({
  time: s.slot_time,
  available: !!s.available,
  reason: s.reason || null,          // null | 'too_soon' | 'full' | 'not_bookable'
  tablesFree: Number(s.tables_free) || 0,
})

/** create_group_booking -> the success panel's data */
export const mapCreated = d => ({
  bookingId: d.booking_id,
  code: d.invite_code || d.code,
  status: d.status || 'pending',
  restaurantId: d.restaurant_id || null,
  startsAt: d.starts_at || null,
  endsAt: d.ends_at || null,
  partySize: Number(d.party_size) || 0,
  // Only set when the RPC says so; the wizard knows its own switch and falls back to it.
  invitesEnabled: d.invites_enabled == null ? null : !!d.invites_enabled,
})

/** get_group_booking_preview -> what the invite page shows (no contact details, ever) */
export const mapPreview = d => ({
  restaurant: mapRestaurant(d.restaurant),
  startsAt: d.starts_at,
  endsAt: d.ends_at,
  partySize: Number(d.party_size) || 0,
  joinedCount: Number(d.joined_count ?? d.member_count) || 0,
  spotsLeft: Number(d.spots_left) || 0,
  hostFirstName: d.host_first_name || d.host_name || null,
  status: d.status,
  isFull: !!d.is_full,
  isExpired: !!d.is_expired,
  joinable: !!d.joinable,
  alreadyMember: !!d.already_member,
  bookingId: d.booking_id || null,
})

/** join_group_booking -> { bookingId, status, seated, tableId } */
export const mapJoined = d => ({
  bookingId: d.booking_id,
  status: d.status,
  memberCount: Number(d.member_count) || 0,
  seated: !!d.seated,
  tableId: d.table_id || null,
})

/** claim_table_from_booking -> the arguments for CartContext.setTable plus display extras */
export const mapClaim = d => ({
  tableId: d.table_id,
  restaurantId: d.restaurant_id,
  restaurantName: d.restaurant_name || null,
  bookingId: d.booking_id,
  sessionStatus: d.session_status,
  isHost: !!d.is_host,
  tableNumber: d.table_number ?? null,
  moved: !!d.moved,
})

export const mapMember = m => {
  // `arrived` (group_booking_detail) = holds a table session at the booking's table. It wins over a stale 'joined'
  // status but never over left / declined.
  const arrived = ['joined', 'arrived'].includes(m.status) && (!!m.arrived || m.status === 'arrived')
  return {
    userId: m.user_id,
    name: m.name || null,
    photo: m.profile_photo || null,
    status: arrived ? 'arrived' : m.status,   // invited | joined | arrived | left | declined
    arrived,
    isHost: !!m.is_host,
    phone: m.phone || null,                   // filled by the server for the host and staff only
    joinedAt: m.joined_at || null,
    arrivedAt: m.arrived_at || null,
  }
}

/** group_booking_detail -> the booking screen's data */
export const mapDetail = d => {
  const members = (d.members || []).map(mapMember)
  const invite = d.invite ? {
    code: d.invite.code,
    expiresAt: d.invite.expires_at,
    maxMembers: Number(d.invite.max_members) || Number(d.party_size) || 0,
  } : null
  return {
    id: d.booking_id,
    status: d.status,                // pending | confirmed | seated | completed | cancelled | no_show
    restaurant: mapRestaurant(d.restaurant),
    startsAt: d.starts_at,
    endsAt: d.ends_at,
    partySize: Number(d.party_size) || 0,
    note: d.note || null,
    tableId: d.table_id || null,
    tableNumber: d.table_number ?? null,
    isHost: !!d.is_host,
    myRole: d.my_role || (d.is_host ? 'host' : 'guest'),
    myStatus: d.my_status || null,
    invite,
    // The host can switch the link off; a backend that does not send the flag yet means "on" (the old behaviour).
    invitesEnabled: d.invites_enabled !== false,
    memberCount: Number(d.member_count) || 0,
    spotsLeft: Number(d.spots_left) || 0,
    members,
    // A solo booking has neither an invite nor member rows; a group booking always has both.
    isGroup: !!invite || members.length > 0,
  }
}

/** list_my_bookings -> rows of the Profile tab */
export const mapListRow = d => ({
  id: d.booking_id,
  status: d.status,
  restaurant: mapRestaurant(d.restaurant),
  startsAt: d.starts_at,
  endsAt: d.ends_at,
  partySize: Number(d.party_size) || 0,
  myRole: d.my_role || 'host',
  myStatus: d.my_status || null,
  isGroup: !!d.is_group,
  memberCount: Number(d.member_count) || 0,
  inviteCode: d.invite_code || null,
  invitesEnabled: d.invites_enabled !== false,
  tableNumber: d.table_number ?? null,
  note: d.note || null,
})
