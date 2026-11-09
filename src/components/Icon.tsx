import type { CSSProperties } from 'react'

// Inline SVG icons drawn to echo the SF Symbols used by the native iOS app
// (heart.fill, drop.fill, calendar.badge.checkmark, ...). They inherit `currentColor`
// so tab/active colouring works from CSS, and scale with font-size via 1em.

export type IconName =
  | 'heart'
  | 'drop'
  | 'calendar'
  | 'plus'
  | 'gear'
  | 'doc'
  | 'chart'
  | 'dna'
  | 'phone'
  | 'sun'
  | 'moon'
  | 'warning'
  | 'trash'
  | 'chevronUpDown'
  | 'chevronRight'
  | 'clipboard'
  | 'docPlus'
  | 'chevronLeft'
  | 'plusCircle'
  | 'vial'
  | 'atom'
  | 'atomOld'
  | 'flame'
  | 'dropCircle'
  | 'pulse'
  | 'molecule'
  | 'leaf'
  | 'bacteria'
  | 'shield'
  | 'asterisk'
  | 'dumbbell'
  | 'runner'
  | 'figure'
  | 'grid'
  | 'stethoscope'
  | 'caseCross'
  | 'qCircle'
  | 'clockCircle'
  | 'refreshCircle'
  | 'calendarCircle'
  | 'checkCircle'

// Stroke-drawn glyphs (the svg root fills with currentColor, so these opt out of the fill).
const S = { fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' } as const

// A filled status circle with a white glyph on top (Test Plan reason icons).
const circleGlyph = (d: string) => (
  <>
    <circle cx="12" cy="12" r="10" />
    <path d={d} fill="none" stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
  </>
)

const PATHS: Record<IconName, JSX.Element> = {
  clipboard: (
    <path
      fillRule="evenodd"
      d="M9 2h6a2 2 0 0 1 2 2h1.5A2.5 2.5 0 0 1 21 6.5v13a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 19.5v-13A2.5 2.5 0 0 1 5.5 4H7a2 2 0 0 1 2-2Zm0 2v1h6V4H9Zm-2 7h10v2H7v-2Zm0 4h7v2H7v-2Z"
    />
  ),
  docPlus: (
    <path
      fillRule="evenodd"
      d="M7 2h6.6L20 8.4V20a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Zm5 9v2.5H9.5v2H12V18h2v-2.5h2.5v-2H14V11h-2Z"
    />
  ),
  chevronRight: <path d="M9 5l7 7-7 7" {...S} />,
  chevronLeft: <path d="M15 5l-7 7 7 7" {...S} />,
  plusCircle: (
    <path
      fillRule="evenodd"
      d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm1 5v4h4v2h-4v4h-2v-4H7v-2h4V7h2Z"
    />
  ),
  vial: <path d="M8 2.5h8a1 1 0 0 1 0 2h-1V16a3 3 0 0 1-6 0V4.5H8a1 1 0 0 1 0-2Z" />,
  atom: (
    <>
      <path d="M12 2.2 20 6.8v10.4L12 21.8 4 17.2V6.8L12 2.2Z" />
      <path d="M4.3 7 12 11.5 19.7 7M12 11.5v9.8" fill="none" stroke="#fff" strokeWidth={1.6} strokeLinejoin="round" />
    </>
  ),
  atomOld: (
    <>
      <path fillRule="evenodd" d="M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 2.5a6.5 6.5 0 1 1 0 13 6.5 6.5 0 0 1 0-13Z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  flame: (
    <path d="M12 2c.4 3.2-2 5-3.6 7C7 10.7 6 12.3 6 14.5a6 6 0 0 0 12 0c0-2.4-1.2-4.2-2.4-5.6-.4 1.2-1 2-1.9 2.4.5-2.9-.4-6.2-1.7-9.3Z" />
  ),
  dropCircle: (
    <path
      fillRule="evenodd"
      d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm0 4.5c.2 0 .4.1.5.2 1.6 1.9 4 4.7 4 7.1a4.5 4.5 0 0 1-9 0c0-2.4 2.4-5.2 4-7.1.1-.1.3-.2.5-.2Z"
    />
  ),
  molecule: (
    <>
      <path d="M7.5 8.5 12 13l5-3.5M12 13v5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
      <circle cx="6" cy="7" r="3" />
      <circle cx="18" cy="8" r="2.4" />
      <circle cx="12" cy="18.5" r="3" />
    </>
  ),
  pulse: <path d="M3 12h4l2.5-6 4 12 2.5-6H21" {...S} />,
  leaf: (
    <path d="M20 3C10 3 4 8 4 15c0 1.6.4 3 1 4.2C6.2 14.5 9 11.5 13 9.5c-3.5 3-5.5 6.5-6.2 10.7.8.5 1.8.8 3 .8C17 21 20 14 20 3Z" />
  ),
  bacteria: (
    <>
      <circle cx="12" cy="12" r="4" />
      <circle cx="12" cy="4" r="1.8" />
      <circle cx="12" cy="20" r="1.8" />
      <circle cx="4.8" cy="8" r="1.8" />
      <circle cx="19.2" cy="8" r="1.8" />
      <circle cx="4.8" cy="16" r="1.8" />
      <circle cx="19.2" cy="16" r="1.8" />
    </>
  ),
  shield: <path d="M12 2.2 4 5.2v6c0 5 3.4 8.6 8 10.6 4.6-2 8-5.6 8-10.6v-6L12 2.2Z" />,
  asterisk: <path d="M12 3v18M4.2 7.5l15.6 9M19.8 7.5l-15.6 9" {...S} strokeWidth={3} />,
  dumbbell: <path d="M2 9.5h2.5v5H2v-5Zm2.5-2.5H8v10H4.5V7ZM8 10.5h8v3H8v-3ZM16 7h3.5v10H16V7Zm3.5 2.5H22v5h-2.5v-5Z" />,
  runner: (
    <>
      <circle cx="15" cy="4.5" r="2.6" />
      <path d="M13 9l-3 3 3 2.5-1.5 5.5M13 9l3.5 2.5 3-.5M10 12l-3.5 1" {...S} strokeWidth={3.2} />
    </>
  ),
  figure: (
    <>
      <circle cx="12" cy="4.5" r="2.8" />
      <path d="M12 8v6M5 10.5l7-2 7 2M12 14l-3 7M12 14l3 7" {...S} strokeWidth={3.2} />
    </>
  ),
  grid: (
    <>
      <rect x="3" y="3" width="8" height="8" rx="2.2" />
      <rect x="13" y="3" width="8" height="8" rx="2.2" />
      <rect x="3" y="13" width="8" height="8" rx="2.2" />
      <rect x="13" y="13" width="8" height="8" rx="2.2" />
    </>
  ),
  stethoscope: (
    <>
      <path d="M6 3.5V9a4 4 0 0 0 8 0V3.5M10 13v1.5a4.5 4.5 0 0 0 9 0v-1.5" {...S} />
      <circle cx="19" cy="11.5" r="2.2" {...S} />
    </>
  ),
  caseCross: (
    <>
      <path
        fillRule="evenodd"
        d="M6 7h12a3 3 0 0 1 3 3v7a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3v-7a3 3 0 0 1 3-3Zm5 3.5v2H9v2h2v2h2v-2h2v-2h-2v-2h-2Z"
      />
      <path d="M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7" {...S} />
    </>
  ),
  qCircle: circleGlyph('M9.6 9.4a2.5 2.5 0 1 1 3.6 2.2c-.7.4-1.2.9-1.2 1.7M12 16.4v.1'),
  clockCircle: circleGlyph('M12 7v5l3 2'),
  refreshCircle: circleGlyph('M8 12a4 4 0 0 1 7-2.6M16 12a4 4 0 0 1-7 2.6M15.2 7.6v2.2h-2.2M8.8 16.4v-2.2H11'),
  calendarCircle: circleGlyph('M8.5 10.5h7M9.5 8V6.8M14.5 8V6.8M8.5 9h7v6.5h-7z'),
  checkCircle: circleGlyph('M8 12.3l2.7 2.7 5.3-5.6'),
  chevronUpDown: (
    <path d="M12 3.2c.3 0 .6.1.8.3l4.2 4.2a1.1 1.1 0 0 1-1.6 1.6L12 5.9 8.6 9.3A1.1 1.1 0 0 1 7 7.7l4.2-4.2c.2-.2.5-.3.8-.3Zm-5 13.1a1.1 1.1 0 0 1 1.6 0l3.4 3.4 3.4-3.4a1.1 1.1 0 0 1 1.6 1.6l-4.2 4.2a1.1 1.1 0 0 1-1.6 0L7 17.9a1.1 1.1 0 0 1 0-1.6Z" />
  ),
  heart: (
    <path d="M12 21.2c-.3 0-.6-.1-.8-.3C5.6 16.4 2 13.1 2 8.9 2 5.9 4.3 3.6 7.2 3.6c1.9 0 3.6 1 4.8 2.6 1.2-1.6 2.9-2.6 4.8-2.6 2.9 0 5.2 2.3 5.2 5.3 0 4.2-3.6 7.5-9.2 12-.2.2-.5.3-.8.3Z" />
  ),
  drop: (
    <path d="M12 2.2c.3 0 .6.1.8.4 2.4 2.9 7.2 8.9 7.2 13 0 4.2-3.5 7.2-8 7.2s-8-3-8-7.2c0-4.1 4.8-10.1 7.2-13 .2-.3.5-.4.8-.4Z" />
  ),
  calendar: (
    <>
      <path d="M7 2.5c.6 0 1 .4 1 1V5h8V3.5a1 1 0 1 1 2 0V5h.5C20.4 5 22 6.6 22 8.5v10c0 1.9-1.6 3.5-3.5 3.5h-13A3.5 3.5 0 0 1 2 18.5v-10C2 6.6 3.6 5 5.5 5H6V3.5c0-.6.4-1 1-1ZM4 10v8.5c0 .8.7 1.5 1.5 1.5h13c.8 0 1.5-.7 1.5-1.5V10H4Z" />
      <path d="M15.7 12.3a1 1 0 0 1 0 1.4l-4 4a1 1 0 0 1-1.4 0l-2-2a1 1 0 1 1 1.4-1.4l1.3 1.3 3.3-3.3a1 1 0 0 1 1.4 0Z" />
    </>
  ),
  plus: (
    <path d="M12 3.5c.7 0 1.2.5 1.2 1.2v6.1h6.1a1.2 1.2 0 1 1 0 2.4h-6.1v6.1a1.2 1.2 0 1 1-2.4 0v-6.1H4.7a1.2 1.2 0 1 1 0-2.4h6.1V4.7c0-.7.5-1.2 1.2-1.2Z" />
  ),
  gear: (
    <path
      fillRule="evenodd"
      d="M10.3 2h3.4l.5 2.6c.6.2 1.2.5 1.7.9l2.5-.9 1.7 3-2 1.7c.1.6.1 1.2 0 1.8l2 1.7-1.7 3-2.5-.9c-.5.4-1.1.7-1.7.9l-.5 2.6h-3.4l-.5-2.6c-.6-.2-1.2-.5-1.7-.9l-2.5.9-1.7-3 2-1.7a6 6 0 0 1 0-1.8l-2-1.7 1.7-3 2.5.9c.5-.4 1.1-.7 1.7-.9l.5-2.6ZM12 8.6a2.4 2.4 0 1 0 0 4.8 2.4 2.4 0 0 0 0-4.8Z"
      transform="translate(0 1.5)"
    />
  ),
  doc: (
    <path d="M6.5 2h7.1c.5 0 1 .2 1.4.6l4.4 4.4c.4.4.6.9.6 1.4v10.1c0 1.9-1.6 3.5-3.5 3.5h-10A3.5 3.5 0 0 1 3 18.5v-13C3 3.6 4.6 2 6.5 2ZM14 4.2V7c0 .6.4 1 1 1h2.8L14 4.2ZM7 12a1 1 0 1 0 0 2h10a1 1 0 1 0 0-2H7Zm0 4a1 1 0 1 0 0 2h7a1 1 0 1 0 0-2H7Z" />
  ),
  chart: (
    <path d="M4 3a1 1 0 0 1 1 1v14.5c0 .3.2.5.5.5H20a1 1 0 1 1 0 2H5.5A2.5 2.5 0 0 1 3 18.5V4a1 1 0 0 1 1-1Zm16.7 4.3a1 1 0 0 1 0 1.4l-5 5a1 1 0 0 1-1.4 0L11.5 11l-3.8 3.7a1 1 0 0 1-1.4-1.4l4.5-4.5a1 1 0 0 1 1.4 0l2.8 2.8 4.3-4.3a1 1 0 0 1 1.4 0Z" />
  ),
  dna: (
    <path d="M7 2a1 1 0 0 1 1 1c0 2 1.2 3.3 3.3 4.7l.7.5.7-.5C14.8 6.3 16 5 16 3a1 1 0 1 1 2 0c0 2.8-1.7 4.6-3.8 6.1 2.1 1.6 3.8 3.4 3.8 6.1v.8c0 2.8-1.7 4.6-3.8 6.1a1 1 0 0 1-1.2-1.6l.2-.1c.7-.5 1.3-1 1.8-1.4H9c.5.5 1.1.9 1.8 1.4a1 1 0 1 1-1.2 1.6C7.5 20.4 6 18.6 6 16v-.8c0-2.7 1.7-4.5 3.8-6.1C7.7 7.6 6 5.8 6 3a1 1 0 0 1 1-1Zm1.1 14h7.8c.1-.3.1-.6.1-.8v-.2H8v.2c0 .2 0 .5.1.8Zm.5-3h6.8c-.6-.7-1.4-1.3-2.4-2l-1-.7-1 .7c-1 .7-1.8 1.3-2.4 2Z" />
  ),
  phone: (
    <path d="M8 1.5h8c1.7 0 3 1.3 3 3v15c0 1.7-1.3 3-3 3H8a3 3 0 0 1-3-3v-15c0-1.7 1.3-3 3-3Zm2 2.5a.8.8 0 0 0 0 1.5h4a.8.8 0 0 0 0-1.5h-4Z" />
  ),
  sun: (
    <>
      <circle cx="12" cy="12" r="4.5" />
      <path d="M12 1.5c.6 0 1 .4 1 1v1.8a1 1 0 1 1-2 0V2.5c0-.6.4-1 1-1Zm0 17.2c.6 0 1 .4 1 1v1.8a1 1 0 1 1-2 0v-1.8c0-.6.4-1 1-1ZM22.5 12c0 .6-.4 1-1 1h-1.8a1 1 0 1 1 0-2h1.8c.6 0 1 .4 1 1ZM5.3 12c0 .6-.4 1-1 1H2.5a1 1 0 1 1 0-2h1.8c.6 0 1 .4 1 1Zm14.1-7.4c.4.4.4 1 0 1.4l-1.3 1.3a1 1 0 0 1-1.4-1.4l1.3-1.3c.4-.4 1-.4 1.4 0ZM7.3 16.7c.4.4.4 1 0 1.4L6 19.4a1 1 0 0 1-1.4-1.4l1.3-1.3c.4-.4 1-.4 1.4 0Zm12.1 2.7c-.4.4-1 .4-1.4 0l-1.3-1.3a1 1 0 0 1 1.4-1.4l1.3 1.3c.4.4.4 1 0 1.4ZM7.3 7.3c-.4.4-1 .4-1.4 0L4.6 6A1 1 0 0 1 6 4.6l1.3 1.3c.4.4.4 1 0 1.4Z" />
    </>
  ),
  moon: (
    <path d="M10.2 2.3c.3.3.4.8.2 1.2A7.5 7.5 0 0 0 20.5 13.6c.4-.2.9-.1 1.2.2.3.3.4.8.2 1.2A10 10 0 1 1 9 2.1c.4-.2.9-.1 1.2.2Z" />
  ),
  warning: (
    <path d="M10.3 3.2a2 2 0 0 1 3.4 0l8.6 15a2 2 0 0 1-1.7 3H3.4a2 2 0 0 1-1.7-3l8.6-15ZM12 8.5c-.6 0-1 .4-1 1v4.5a1 1 0 1 0 2 0V9.5c0-.6-.4-1-1-1Zm0 8a1.2 1.2 0 1 0 0 2.4 1.2 1.2 0 0 0 0-2.4Z" />
  ),
  trash: (
    <path d="M9.5 2h5c.8 0 1.5.7 1.5 1.5V4.5h4a1 1 0 1 1 0 2h-.9l-.9 13.1c-.1 1.6-1.4 2.9-3 2.9H8.8c-1.6 0-2.9-1.3-3-2.9L4.9 6.5H4a1 1 0 0 1 0-2h4v-1C8 2.7 8.7 2 9.5 2Zm.5 7.5c-.6 0-1 .4-1 1v7a1 1 0 1 0 2 0v-7c0-.6-.4-1-1-1Zm4 0c-.6 0-1 .4-1 1v7a1 1 0 1 0 2 0v-7c0-.6-.4-1-1-1ZM10 4v.5h4V4h-4Z" />
  ),
}

export function Icon({
  name,
  className,
  size,
  style,
}: {
  name: IconName
  className?: string
  size?: number | string
  style?: CSSProperties
}) {
  return (
    <svg
      className={className ? `icon ${className}` : 'icon'}
      viewBox="0 0 24 24"
      width={size ?? '1em'}
      height={size ?? '1em'}
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
      style={style}
    >
      {PATHS[name]}
    </svg>
  )
}
