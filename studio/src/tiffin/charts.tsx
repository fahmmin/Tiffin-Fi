import { useId, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react'
import { fmtDateTime } from './format'
import { Card, PENDING } from './ui'

export interface Pt {
  t: number
  v: number
}
export interface Series {
  name: string
  color: string
  points: Pt[]
}

/** A card with a title, the current value, the chart and an optional note. */
export function ChartCard({ title, value, note, children, className = '' }: { title: string; value: ReactNode; note?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <Card className={className}>
      <h3 className="display text-[19px] !tracking-[-0.03em]">{title}</h3>
      <div className="display num mt-1 text-[28px] leading-tight tracking-[-0.03em] sm:text-[32px]">{value}</div>
      {note && <p className="label mt-1 text-[13px] text-ink-2">{note}</p>}
      <div className="mt-4">{children}</div>
    </Card>
  )
}

/** Shown in place of a chart that is loading or could not be read. */
export function ChartMessage({ children, tone = 'plain' }: { children: ReactNode; tone?: 'plain' | 'bad' }) {
  return (
    <div
      role={tone === 'bad' ? 'status' : undefined}
      className={`label grid h-[200px] place-items-center rounded-2xl px-4 text-center text-[14px] ${tone === 'bad' ? 'bg-bad-soft text-bad' : 'bg-well text-ink-2'}`}
    >
      {children}
    </div>
  )
}

export const LOADING = <ChartMessage>{PENDING}</ChartMessage>

function nearest(times: number[], t: number): number {
  let best = 0
  for (let i = 1; i < times.length; i++) if (Math.abs(times[i] - t) < Math.abs(times[best] - t)) best = i
  return best
}

interface Tip {
  /** 0..100, where the tooltip anchors across the plot. */
  x: number
  time: string
  rows: { label: string; value: string; color: string }[]
}

function Tooltip({ tip }: { tip: Tip }) {
  const left = Math.min(Math.max(tip.x, 18), 82)
  return (
    <div
      className="label pointer-events-none absolute top-1 z-10 min-w-[120px] -translate-x-1/2 rounded-xl bg-ink px-3 py-2 text-[12px] text-white shadow-lg"
      style={{ left: `${left}%` }}
    >
      <div className="num text-white/70">{tip.time}</div>
      {tip.rows.map((r) => (
        <div key={r.label} className="num mt-0.5 flex items-center gap-1.5 font-semibold">
          <span className="size-2 rounded-full" style={{ background: r.color }} aria-hidden="true" />
          {r.label ? `${r.label} ` : ''}
          {r.value}
        </div>
      ))}
    </div>
  )
}

function tickDates(t0: number, t1: number): string[] {
  return [t0, (t0 + t1) / 2, t1].map((t) => fmtDateTime(Math.round(t)))
}

/**
 * Inline SVG line chart. The lines are drawn in a stretched viewBox with non-scaling strokes; labels, dots and the
 * tooltip are HTML so they stay readable at any width.
 */
export function LineChart({ series, fmt, label, includeZero = false }: { series: Series[]; fmt: (v: number) => string; label: string; includeZero?: boolean }) {
  const [active, setActive] = useState<number | null>(null)
  const gid = useId()
  const box = useRef<HTMLDivElement>(null)
  const ref = series[0]?.points ?? []
  if (ref.length < 2) return <ChartMessage>Not enough history yet.</ChartMessage>

  const t0 = ref[0].t
  const t1 = ref[ref.length - 1].t
  const all = series.flatMap((s) => s.points.map((p) => p.v))
  let lo = Math.min(...all, ...(includeZero ? [0] : []))
  let hi = Math.max(...all)
  if (hi === lo) {
    const pad = Math.abs(hi) * 0.01 || 0.01
    lo -= pad
    hi += pad
  } else {
    const pad = (hi - lo) * 0.12
    hi += pad
    if (!includeZero) lo -= pad
  }
  const X = (t: number) => (t1 === t0 ? 50 : ((t - t0) / (t1 - t0)) * 100)
  const Y = (v: number) => 100 - ((v - lo) / (hi - lo)) * 100
  const times = ref.map((p) => p.t)

  const at = (clientX: number) => {
    const r = box.current?.getBoundingClientRect()
    if (!r || r.width === 0) return
    const frac = Math.min(1, Math.max(0, (clientX - r.left) / r.width))
    setActive(nearest(times, t0 + frac * (t1 - t0)))
  }
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowLeft') setActive((a) => Math.max(0, (a ?? ref.length) - 1))
    else if (e.key === 'ArrowRight') setActive((a) => Math.min(ref.length - 1, (a ?? -1) + 1))
    else if (e.key === 'Escape') setActive(null)
    else return
    e.preventDefault()
  }

  const tip: Tip | null =
    active === null
      ? null
      : {
          x: X(ref[active].t),
          time: fmtDateTime(ref[active].t),
          rows: series.map((s) => ({ label: series.length > 1 ? s.name : '', value: fmt(s.points[active]?.v ?? 0), color: s.color })),
        }

  return (
    <div>
      <div className="grid grid-cols-[auto_1fr] gap-x-2">
        <div className="label num flex h-[180px] flex-col justify-between text-right text-[11px] text-ink-2">
          <span>{fmt(hi)}</span>
          <span>{fmt((hi + lo) / 2)}</span>
          <span>{fmt(lo)}</span>
        </div>
        <div
          ref={box}
          role="img"
          tabIndex={0}
          aria-label={`${label}. Use the left and right arrow keys to read values.`}
          onPointerMove={(e: PointerEvent) => at(e.clientX)}
          onPointerDown={(e: PointerEvent) => at(e.clientX)}
          onPointerLeave={(e: PointerEvent) => {
            if (e.pointerType === 'mouse') setActive(null)
          }}
          onKeyDown={onKey}
          onBlur={() => setActive(null)}
          className="relative h-[180px] cursor-crosshair rounded-lg"
          style={{ touchAction: 'pan-y' }}
        >
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 size-full" aria-hidden="true">
            <defs>
              <linearGradient id={`${gid}-fill`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor={series[0].color} stopOpacity="0.18" />
                <stop offset="1" stopColor={series[0].color} stopOpacity="0" />
              </linearGradient>
            </defs>
            {[0, 50, 100].map((y) => (
              <line key={y} x1="0" x2="100" y1={y} y2={y} stroke="#e6e6ea" strokeWidth="1" strokeDasharray={y === 100 ? undefined : '3 3'} vectorEffect="non-scaling-stroke" />
            ))}
            {series.length === 1 && (
              <path d={`M${series[0].points.map((p) => `${X(p.t)} ${Y(p.v)}`).join('L')}L100 100L0 100Z`} fill={`url(#${gid}-fill)`} />
            )}
            {series.map((s) => (
              <polyline key={s.name} points={s.points.map((p) => `${X(p.t)},${Y(p.v)}`).join(' ')} fill="none" stroke={s.color} strokeWidth="2.25" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
            ))}
          </svg>
          {active !== null && (
            <>
              <div className="pointer-events-none absolute inset-y-0 w-px bg-ink/25" style={{ left: `${X(ref[active].t)}%` }} aria-hidden="true" />
              {series.map((s) => (
                <span
                  key={s.name}
                  className="pointer-events-none absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white"
                  style={{ left: `${X(ref[active].t)}%`, top: `${Y(s.points[active]?.v ?? lo)}%`, background: s.color }}
                  aria-hidden="true"
                />
              ))}
            </>
          )}
          {tip && <Tooltip tip={tip} />}
        </div>
        <span />
        <div className="label num mt-2 flex justify-between gap-2 text-[11px] text-ink-2">
          {tickDates(t0, t1).map((d, i) => (
            <span key={i} className={i === 1 ? 'hidden sm:inline' : ''}>
              {d}
            </span>
          ))}
        </div>
      </div>
      {series.length > 1 && (
        <ul className="label mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-ink-2">
          {series.map((s) => (
            <li key={s.name} className="flex items-center gap-1.5">
              <span className="h-0.5 w-4 rounded-full" style={{ background: s.color }} aria-hidden="true" />
              {s.name}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** Bars, one per bucket (an hour). Hover or tap a bar to read it. */
export function BarChart({ bars, fmt, label, color, unit }: { bars: Pt[]; fmt: (v: number) => string; label: string; color: string; unit: string }) {
  const [active, setActive] = useState<number | null>(null)
  const box = useRef<HTMLDivElement>(null)
  if (bars.length === 0) return <ChartMessage>No swaps in this window yet.</ChartMessage>
  const max = Math.max(...bars.map((b) => b.v), 0) || 1
  const at = (clientX: number) => {
    const r = box.current?.getBoundingClientRect()
    if (!r || r.width === 0) return
    const frac = Math.min(0.999, Math.max(0, (clientX - r.left) / r.width))
    setActive(Math.floor(frac * bars.length))
  }
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowLeft') setActive((a) => Math.max(0, (a ?? bars.length) - 1))
    else if (e.key === 'ArrowRight') setActive((a) => Math.min(bars.length - 1, (a ?? -1) + 1))
    else if (e.key === 'Escape') setActive(null)
    else return
    e.preventDefault()
  }
  const tip: Tip | null =
    active === null
      ? null
      : { x: ((active + 0.5) / bars.length) * 100, time: `${fmtDateTime(bars[active].t)}, ${unit}`, rows: [{ label: '', value: fmt(bars[active].v), color }] }

  return (
    <div className="grid grid-cols-[auto_1fr] gap-x-2">
      <div className="label num flex h-[180px] flex-col justify-between text-right text-[11px] text-ink-2">
        <span>{fmt(max)}</span>
        <span>{fmt(0)}</span>
      </div>
      <div
        ref={box}
        role="img"
        tabIndex={0}
        aria-label={`${label}. Use the left and right arrow keys to read values.`}
        onPointerMove={(e: PointerEvent) => at(e.clientX)}
        onPointerDown={(e: PointerEvent) => at(e.clientX)}
        onPointerLeave={(e: PointerEvent) => {
          if (e.pointerType === 'mouse') setActive(null)
        }}
        onKeyDown={onKey}
        onBlur={() => setActive(null)}
        className="relative flex h-[180px] cursor-crosshair items-end gap-px border-b border-line"
        style={{ touchAction: 'pan-y' }}
      >
        {bars.map((b, i) => (
          <div key={b.t} className="flex h-full min-w-0 flex-1 items-end">
            <div
              className="w-full rounded-t-[2px]"
              style={{ height: `${b.v > 0 ? Math.max((b.v / max) * 100, 2) : 0}%`, background: color, opacity: active === null || active === i ? 1 : 0.45 }}
            />
          </div>
        ))}
        {tip && <Tooltip tip={tip} />}
      </div>
      <span />
      <div className="label num mt-2 flex justify-between gap-2 text-[11px] text-ink-2">
        {tickDates(bars[0].t, bars[bars.length - 1].t).map((d, i) => (
          <span key={i} className={i === 1 ? 'hidden sm:inline' : ''}>
            {d}
          </span>
        ))}
      </div>
    </div>
  )
}

/** Diverging bars: how far each pool price is from Chainlink's, in percent. */
export function GapChart({ rows }: { rows: { name: string; color: string; pct: number; detail: string }[] }) {
  const [active, setActive] = useState<number | null>(null)
  const span = Math.max(1, ...rows.map((r) => Math.abs(r.pct))) * 1.15
  return (
    <div>
      <ul className="space-y-3">
        {rows.map((r, i) => (
          <li
            key={r.name}
            tabIndex={0}
            onPointerEnter={() => setActive(i)}
            onPointerDown={() => setActive(i)}
            onPointerLeave={(e) => e.pointerType === 'mouse' && setActive(null)}
            onFocus={() => setActive(i)}
            onBlur={() => setActive(null)}
            className="relative rounded-xl"
          >
            <div className="grid grid-cols-[56px_1fr_64px] items-center gap-2">
              <span className="label flex items-center gap-1.5 text-[13px] font-semibold">
                <span className="size-2.5 rounded-full" style={{ background: r.color }} aria-hidden="true" />
                {r.name}
              </span>
              <div className="relative h-5 rounded-full bg-well" aria-hidden="true">
                <div className="absolute inset-y-0 left-1/2 w-px bg-ink/25" />
                <div
                  className="absolute inset-y-0.5 rounded-full"
                  style={{
                    background: r.color,
                    width: `${(Math.abs(r.pct) / span) * 50}%`,
                    left: r.pct >= 0 ? '50%' : undefined,
                    right: r.pct < 0 ? '50%' : undefined,
                  }}
                />
              </div>
              <span className="label num text-right text-[13px] font-semibold">
                {r.pct > 0 ? '+' : r.pct < 0 ? '−' : ''}
                {Math.abs(r.pct).toFixed(2)}%
              </span>
            </div>
            {active === i && (
              <div className="label num pointer-events-none absolute -top-9 left-14 z-10 whitespace-nowrap rounded-xl bg-ink px-3 py-1.5 text-[12px] font-semibold text-white shadow-lg">
                {r.detail}, right now
              </div>
            )}
          </li>
        ))}
      </ul>
      <div className="label num mt-3 grid grid-cols-[56px_1fr_64px] gap-2 text-[11px] text-ink-2">
        <span />
        <div className="flex justify-between">
          <span>−{span.toFixed(0)}% (pool below)</span>
          <span>0</span>
          <span>+{span.toFixed(0)}% (pool above)</span>
        </div>
        <span />
      </div>
    </div>
  )
}
