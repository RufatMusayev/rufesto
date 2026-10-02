// Small stroke glyphs for the Profile screen. Saved is a plate with a flag (never a heart or thumbs).
const base = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' }

function Svg({ size = 20, children, strokeWidth }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" focusable="false"
      style={strokeWidth ? { ...base, strokeWidth } : base}>
      {children}
    </svg>
  )
}

export const GridIcon = p => (
  <Svg {...p}><rect x="4" y="4" width="6.5" height="6.5" rx="1.2" /><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.2" /><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.2" /><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.2" /></Svg>
)
export const CalendarIcon = p => (
  <Svg {...p}><rect x="4" y="5.5" width="16" height="14.5" rx="2.2" /><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4" /></Svg>
)
export const StarIcon = p => (
  <Svg {...p}><path d="M12 4l2.3 4.8 5.2.7-3.8 3.6.9 5.2L12 15.8 7.4 18.3l.9-5.2L4.5 9.5l5.2-.7z" /></Svg>
)
export const PlateIcon = p => (
  <Svg {...p}><circle cx="11" cy="13" r="7" /><circle cx="11" cy="13" r="3.6" /><path d="M18.5 3.5v6.5M18.5 3.5l3 1.6-3 1.6" /></Svg>
)
export const ReceiptIcon = p => (
  <Svg {...p}><path d="M6 3.5h12v17l-2.4-1.6L13.2 20.5 12 19.6l-1.2.9-2.4-1.6L6 20.5z" /><path d="M9 8.5h6M9 12h6" /></Svg>
)
export const GearIcon = p => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 3.5l1.2 2.2 2.5-.6.9 2.4 2.4.9-.6 2.5 2.2 1.2-2.2 1.2.6 2.5-2.4.9-.9 2.4-2.5-.6L12 20.5l-1.2-2.2-2.5.6-.9-2.4-2.4-.9.6-2.5L3.4 12l2.2-1.2-.6-2.5 2.4-.9.9-2.4 2.5.6z" />
  </Svg>
)
export const PencilIcon = p => (
  <Svg {...p}><path d="M4.5 19.5l1-4L16 5a2.1 2.1 0 013 3L8.5 18.5z" /><path d="M14.5 6.5l3 3" /></Svg>
)
export const BellIcon = p => (
  <Svg {...p}><path d="M6 16.5V11a6 6 0 1112 0v5.5l1.5 2h-15z" /><path d="M10 20.5a2.2 2.2 0 004 0" /></Svg>
)
export const GlobeIcon = p => (
  <Svg {...p}><circle cx="12" cy="12" r="8.5" /><path d="M3.5 12h17M12 3.5c2.4 2.4 3.4 5.2 3.4 8.5s-1 6.1-3.4 8.5c-2.4-2.4-3.4-5.2-3.4-8.5s1-6.1 3.4-8.5z" /></Svg>
)
export const MoonIcon = p => (
  <Svg {...p}><path d="M19.5 14.5A7.5 7.5 0 019.5 4.5a7.5 7.5 0 1010 10z" /></Svg>
)
export const ForkKnifeIcon = p => (
  <Svg {...p}><path d="M7 2.5v7a2.5 2.5 0 005 0v-7M9.5 2.5v19" /><path d="M16 2.5c-1.7 1.4-2.5 3.4-2.5 5.5 0 1.6.9 2.5 2.5 2.5v11" /></Svg>
)
export const SignOutIcon = p => (
  <Svg {...p}><path d="M10 4.5H6a1.5 1.5 0 00-1.5 1.5v12A1.5 1.5 0 006 19.5h4" /><path d="M15 8l4 4-4 4M19 12H9.5" /></Svg>
)
export const TrashIcon = p => (
  <Svg {...p}><path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l.8 12.5h9.4L17.5 7M10 11v5M14 11v5" /></Svg>
)
export const PlusIcon = p => (
  <Svg strokeWidth={2.2} {...p}><path d="M12 5v14M5 12h14" /></Svg>
)
export const ChevronIcon = p => (
  <Svg strokeWidth={2} {...p}><path d="M9 5l7 7-7 7" /></Svg>
)
export const CameraIcon = p => (
  <Svg {...p}><path d="M4 8.5h3l1.5-2.5h7L17 8.5h3v10.5H4z" /><circle cx="12" cy="13.5" r="3.4" /></Svg>
)
export const CloseIcon = p => (
  <Svg strokeWidth={2} {...p}><path d="M18 6L6 18M6 6l12 12" /></Svg>
)
