/** Six pools around one hook. Used on the landing page (dark) and the How it works screen (light). */
export function PoolDiagram({ dark = false, className = '' }: { dark?: boolean; className?: string }) {
  const pill = dark ? { fill: '#1b1630', stroke: '#3b3360', text: '#ffffff' } : { fill: '#ffffff', stroke: '#d8d0ff', text: '#0d0d10' }
  const link = dark ? '#3b3360' : '#d8d0ff'
  const pools = [
    { l: 'NVDA/USDC', x: 280, y: 36 },
    { l: 'NVDA/MSFT', x: 130, y: 96 },
    { l: 'AAPL/USDC', x: 430, y: 96 },
    { l: 'AAPL/MSFT', x: 130, y: 204 },
    { l: 'MSFT/USDC', x: 430, y: 204 },
    { l: 'NVDA/AAPL', x: 280, y: 264 },
  ]
  return (
    <svg viewBox="0 0 560 300" className={`w-full ${className}`} role="img" aria-label="One hook serves six pools: NVDA/USDC, NVDA/MSFT, AAPL/USDC, AAPL/MSFT, MSFT/USDC and NVDA/AAPL, all from one reserve">
      {pools.map((p) => (
        <line key={p.l} x1="280" y1="150" x2={p.x} y2={p.y} stroke={link} strokeWidth="2" />
      ))}
      <ellipse cx="280" cy="150" rx="74" ry="44" fill="#6e54ff" />
      <text x="280" y="148" textAnchor="middle" fill="#fff" fontSize="22" fontWeight="700" fontFamily="Switzer, sans-serif" letterSpacing="-0.5">
        One hook
      </text>
      <text x="280" y="170" textAnchor="middle" fill="#e6e0ff" fontSize="14" fontFamily="Geist, sans-serif">
        one reserve
      </text>
      {pools.map((p) => (
        <g key={p.l}>
          <rect x={p.x - 74} y={p.y - 20} width="148" height="40" rx="20" fill={pill.fill} stroke={pill.stroke} strokeWidth="2" />
          <text x={p.x} y={p.y + 5} textAnchor="middle" fill={pill.text} fontSize="15" fontWeight="700" fontFamily="Geist, sans-serif">
            {p.l}
          </text>
        </g>
      ))}
    </svg>
  )
}
