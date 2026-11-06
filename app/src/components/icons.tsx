import type { ReactNode } from 'react'

const Svg = ({ size = 20, children }: { size?: number; children: ReactNode }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.7"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    {children}
  </svg>
)

/** The mark: a quatrefoil, one lobe per asset in the basket. */
export function Mark({ size = 28 }: { size?: number }) {
  return (
    <svg className="mark" width={size} height={size} viewBox="-16 -16 32 32" fill="none" aria-hidden="true" focusable="false">
      {[
        [0, -6.5],
        [6.5, 0],
        [0, 6.5],
        [-6.5, 0],
      ].map(([x, y]) => (
        <circle key={`${x}${y}`} cx={x} cy={y} r="7" stroke="currentColor" strokeWidth="2.2" />
      ))}
    </svg>
  )
}

export const ArrowUpRight = ({ size = 16 }: { size?: number }) => (
  <Svg size={size}>
    <path d="M7 17 17 7M9 7h8v8" />
  </Svg>
)

export const FundIcon = () => (
  <Svg>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 3.5V12h8.5" />
  </Svg>
)

export const TradeIcon = () => (
  <Svg>
    <path d="M4 8h14l-3.5-3.5M20 16H6l3.5 3.5" />
  </Svg>
)

export const ActivityIcon = () => (
  <Svg>
    <path d="M3 12h4l2.5-6 5 12 2.5-6h4" />
  </Svg>
)

export const HowIcon = () => (
  <Svg>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 11v5.5M12 7.6v.1" />
  </Svg>
)

export const Check = () => (
  <Svg size={16}>
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </Svg>
)

export const Cross = () => (
  <Svg size={16}>
    <path d="M6.5 6.5 17.5 17.5M17.5 6.5 6.5 17.5" />
  </Svg>
)
