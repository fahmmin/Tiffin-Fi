import { useEffect, useState, type AnchorHTMLAttributes, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { ArrowUpRight, Loader2 } from 'lucide-react'

/** What every number shows until its first read returns. */
export const PENDING = '…'

export function LogoMark({ size = 30, color = '#6e54ff' }: { size?: number | string; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <g stroke={color} strokeWidth="2" strokeLinecap="round">
        <circle cx="16" cy="9.5" r="6.5" />
        <circle cx="16" cy="22.5" r="6.5" />
        <circle cx="9.5" cy="16" r="6.5" />
        <circle cx="22.5" cy="16" r="6.5" />
      </g>
    </svg>
  )
}

export function Wordmark({ light = false }: { light?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <LogoMark color={light ? '#fff' : '#6e54ff'} />
      <span className={`display text-[21px] leading-none ${light ? 'text-white' : 'text-ink'}`}>Tiffin Fi</span>
    </span>
  )
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-3xl bg-white p-5 shadow-card sm:p-6 ${className}`}>{children}</section>
}

export type PillTone = 'grey' | 'lav' | 'cyan' | 'amber' | 'green' | 'red' | 'ink' | 'pink'

export function Pill({ children, tone = 'grey', className = '' }: { children: ReactNode; tone?: PillTone; className?: string }) {
  const tones: Record<PillTone, string> = {
    grey: 'bg-well text-ink-2',
    lav: 'bg-lav text-accent-ink',
    cyan: 'bg-ok-soft text-ok',
    green: 'bg-ok-soft text-ok',
    amber: 'bg-warn-soft text-warn',
    red: 'bg-bad-soft text-bad',
    pink: 'bg-bad-soft text-bad',
    ink: 'bg-ink text-white',
  }
  return (
    <span className={`label inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-semibold ${tones[tone]} ${className}`}>
      {children}
    </span>
  )
}

export function Dot({ className = 'bg-current' }: { className?: string }) {
  return <span className={`inline-block size-1.5 rounded-full ${className}`} aria-hidden="true" />
}

/** Small rounded label with a dot either side. */
export function Chip({ children, dark = false, className = '' }: { children: ReactNode; dark?: boolean; className?: string }) {
  return (
    <span
      className={`label inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-[13px] font-semibold ${dark ? 'bg-deep-2 text-ondeep' : 'bg-well text-ink'} ${className}`}
    >
      <Dot />
      {children}
      <Dot />
    </span>
  )
}

export function NumBadge({ n, active = false, dark = false }: { n: string; active?: boolean; dark?: boolean }) {
  const cls = active ? 'bg-accent text-white' : dark ? 'bg-deep-2 text-ondeep' : 'bg-well text-ink-2'
  return <span className={`label num grid h-7 min-w-9 place-items-center rounded-lg px-2 text-[12px] font-bold ${cls}`}>{n}</span>
}

export function ArrowCircle({ tone = 'white' }: { tone?: 'white' | 'accent' }) {
  return (
    <span
      className={`grid size-9 shrink-0 place-items-center rounded-full ${tone === 'white' ? 'bg-white text-accent' : 'bg-accent text-white'}`}
      aria-hidden="true"
    >
      <ArrowUpRight className="size-4" strokeWidth={2.2} />
    </span>
  )
}

const CTA_BASE =
  'inline-flex items-center justify-center gap-3 rounded-full font-semibold transition active:scale-[0.985] disabled:cursor-not-allowed disabled:opacity-50'

type CtaVariant = 'primary' | 'outline' | 'ondark'

function ctaClass(variant: CtaVariant, size: 'md' | 'lg' = 'md') {
  const pad = size === 'lg' ? 'min-h-14 py-2 pl-7 pr-2 text-[17px]' : 'min-h-12 py-1.5 pl-5 pr-1.5 text-[15px]'
  const plain = size === 'lg' ? 'min-h-14 px-7 text-[17px]' : 'min-h-12 px-5 text-[15px]'
  if (variant === 'primary') return `${CTA_BASE} ${pad} bg-accent text-white shadow-cta hover:bg-accent-dark`
  if (variant === 'ondark') return `${CTA_BASE} ${pad} bg-white text-ink hover:bg-lav`
  return `${CTA_BASE} ${plain} border border-line bg-white text-ink hover:bg-well`
}

/** Link-styled call to action: primary (accent with glow), outline, or on-dark. */
export function CtaLink({
  variant = 'primary',
  size = 'md',
  children,
  ...rest
}: AnchorHTMLAttributes<HTMLAnchorElement> & { variant?: CtaVariant; size?: 'md' | 'lg' }) {
  return (
    <a {...rest} className={`${ctaClass(variant, size)} ${rest.className ?? ''}`}>
      {children}
      {variant !== 'outline' && <ArrowCircle tone={variant === 'ondark' ? 'accent' : 'white'} />}
    </a>
  )
}

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'outline' | 'dark' | 'ghost'
  loading?: boolean
  full?: boolean
}

/** Plain in-app button (forms, wallet). */
export function Button({ variant = 'primary', loading, full, className = '', children, disabled, ...rest }: BtnProps) {
  const styles: Record<string, string> = {
    primary: 'bg-accent text-white hover:bg-accent-dark',
    outline: 'border border-line bg-white text-ink hover:bg-well',
    dark: 'bg-ink text-white hover:bg-deep-2',
    ghost: 'bg-transparent text-accent-ink hover:bg-lav',
  }
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={`label inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-5 py-2.5 text-[14px] font-semibold transition active:scale-[0.985] disabled:cursor-not-allowed disabled:opacity-50 ${styles[variant]} ${full ? 'w-full' : ''} ${className}`}
    >
      {loading && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
      {children}
    </button>
  )
}

export function useNow(intervalMs = 30_000): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  return now
}

/** A value, or the pending mark until the first read returns. */
export function Val({ v }: { v: ReactNode | null | undefined | false }) {
  return <>{v === null || v === undefined || v === false ? PENDING : v}</>
}

export function Stat({ label, children, tone }: { label: string; children: ReactNode; tone?: 'accent' }) {
  return (
    <div className="min-w-0">
      <div className="label text-[13px] text-ink-2">{label}</div>
      <div className={`display num mt-1 truncate text-[34px] leading-tight sm:text-[40px] ${tone === 'accent' ? 'text-accent-ink' : 'text-ink'}`}>{children}</div>
    </div>
  )
}

/** Shown on every screen when the last poll failed. Keeps the last good values below it. */
export function ReadBanner({ message, className = '' }: { message: string | null; className?: string }) {
  if (!message) return null
  return (
    <p role="alert" className={`label rounded-2xl bg-bad-soft px-4 py-3 text-[13px] font-medium text-bad ${className}`}>
      {message}
    </p>
  )
}
