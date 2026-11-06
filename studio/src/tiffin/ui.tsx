import { useEffect, useState, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { ArrowUpRight, Loader2 } from 'lucide-react'

export function LogoMark({ size = 30, color = '#6E54FF' }: { size?: number | string; color?: string }) {
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
      <LogoMark color={light ? '#fff' : '#6E54FF'} />
      <span className={`display text-[22px] leading-none ${light ? 'text-white' : 'text-ink'}`}>Tiffin Fi</span>
    </span>
  )
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-3xl border border-[#E8E7EE] bg-white p-5 sm:p-6 ${className}`}>{children}</section>
}

export function Pill({ children, tone = 'grey', className = '' }: { children: ReactNode; tone?: 'grey' | 'lav' | 'cyan' | 'amber' | 'green' | 'red' | 'ink'; className?: string }) {
  const tones: Record<string, string> = {
    grey: 'bg-[#EFEFEF] text-[#4a4757]',
    lav: 'bg-lav text-accent-dark',
    cyan: 'bg-[#DDF6FD] text-[#0B6177]',
    amber: 'bg-[#FFF1D6] text-[#8A5A00]',
    green: 'bg-[#DFF6E7] text-[#14693A]',
    red: 'bg-[#FFE3E3] text-[#A12323]',
    ink: 'bg-ink text-white',
  }
  return (
    <span className={`label inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-medium ${tones[tone]} ${className}`}>
      {children}
    </span>
  )
}

export function Dot({ className = 'bg-current' }: { className?: string }) {
  return <span className={`inline-block size-1.5 rounded-full ${className}`} aria-hidden="true" />
}

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'outline' | 'dark' | 'ghost'
  loading?: boolean
  arrow?: boolean
  full?: boolean
}

export function Button({ variant = 'primary', loading, arrow, full, className = '', children, disabled, ...rest }: BtnProps) {
  const styles: Record<string, string> = {
    primary: 'bg-accent text-white hover:bg-accent-dark shadow-[0_10px_24px_-10px_rgba(110,84,255,0.7)]',
    outline: 'border border-[#cfcdd8] bg-transparent text-ink hover:bg-white',
    dark: 'bg-ink text-white hover:bg-[#241d3d]',
    ghost: 'bg-transparent text-accent hover:bg-lav',
  }
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={`inline-flex min-h-11 items-center justify-center gap-2.5 rounded-full px-5 py-2.5 text-[15px] font-medium transition active:scale-[0.985] disabled:cursor-not-allowed disabled:opacity-50 ${styles[variant]} ${full ? 'w-full' : ''} ${className}`}
    >
      {loading && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
      {children}
      {arrow && <ArrowCircle />}
    </button>
  )
}

export function ArrowCircle({ dark = false }: { dark?: boolean }) {
  return (
    <span className={`-mr-2 grid size-7 place-items-center rounded-full ${dark ? 'bg-ink text-white' : 'bg-white text-accent'}`} aria-hidden="true">
      <ArrowUpRight className="size-3.5" strokeWidth={2.2} />
    </span>
  )
}

export function Skeleton({ className = '', children }: { className?: string; children?: ReactNode }) {
  return <span className={`skeleton inline-block ${className}`}>{children ?? '0000'}</span>
}

export function useNow(intervalMs = 30_000): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  return now
}

export function Stat({ label, children, tone }: { label: string; children: ReactNode; tone?: 'accent' }) {
  return (
    <div className="min-w-0">
      <div className="label text-[13px] text-[#6b6878]">{label}</div>
      <div className={`display num mt-1 truncate text-[34px] leading-tight sm:text-[40px] ${tone === 'accent' ? 'text-accent' : 'text-ink'}`}>{children}</div>
    </div>
  )
}
