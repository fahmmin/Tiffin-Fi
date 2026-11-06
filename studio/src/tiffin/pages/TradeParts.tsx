import type { ReactNode } from 'react'
import { AlertTriangle, CheckCircle2, ExternalLink, Loader2 } from 'lucide-react'
import { txUrl } from '../chain'
import { sanitizeInput } from '../format'
import type { TxPhase } from '../tx'
import { useWallet } from '../wallet'

export function TokenChip({ symbol, color }: { symbol: string; color: string }) {
  return (
    <span className="display inline-flex min-h-10 items-center gap-2 rounded-full bg-white px-3.5 py-1.5 text-[15px] shadow-card">
      <span className="size-4 rounded-full" style={{ background: color }} aria-hidden="true" />
      {symbol}
    </span>
  )
}

export function AmountField({
  label,
  value,
  onChange,
  decimals,
  balanceText,
  onMax,
  right,
  readOnly,
  hint,
}: {
  label: string
  value: string
  onChange?: (v: string) => void
  decimals: number
  balanceText?: string
  onMax?: () => void
  right: ReactNode
  readOnly?: boolean
  hint?: ReactNode
}) {
  const id = `amt-${label.replace(/\W+/g, '-').toLowerCase()}`
  return (
    <div className="rounded-2xl bg-well p-4 focus-within:ring-2 focus-within:ring-accent">
      <div className="flex items-center justify-between gap-3">
        <label htmlFor={id} className="label text-[14px] text-ink-2">
          {label}
        </label>
        {right}
      </div>
      <input
        id={id}
        inputMode="decimal"
        autoComplete="off"
        placeholder="0"
        value={value}
        readOnly={readOnly}
        aria-label={undefined}
        onChange={(e) => onChange?.(sanitizeInput(e.target.value, decimals))}
        className="display num mt-3 w-full min-w-0 bg-transparent text-[40px] leading-none text-ink outline-none placeholder:text-ink-3 focus-visible:outline-none"
      />
      <div className="mt-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        {hint ? <div className="label text-[13px] text-ink-2">{hint}</div> : <span />}
        {balanceText && (
          <button
            type="button"
            onClick={onMax}
            disabled={!onMax}
            className="label min-h-8 rounded-full px-2 text-[12px] font-semibold text-accent-ink hover:bg-lav disabled:cursor-default disabled:text-ink-2 disabled:hover:bg-transparent"
          >
            {balanceText}
            {onMax ? ' · Max' : ''}
          </button>
        )}
      </div>
    </div>
  )
}

export function Rows({ rows }: { rows: { k: string; v: ReactNode; strong?: boolean }[] }) {
  return (
    <dl className="label divide-y divide-line rounded-2xl border border-line px-4 text-[15px]">
      {rows.map((r) => (
        <div key={r.k} className="flex items-start justify-between gap-4 py-3">
          <dt className="shrink-0 text-ink-2">{r.k}</dt>
          <dd className={`num text-right ${r.strong ? 'font-semibold text-ink' : 'font-semibold text-ink'}`}>{r.v}</dd>
        </div>
      ))}
    </dl>
  )
}

export function Warn({ children, tone = 'amber' }: { children: ReactNode; tone?: 'amber' | 'red' | 'lav' }) {
  const t = { amber: 'bg-warn-soft text-warn', red: 'bg-bad-soft text-bad', lav: 'bg-lav text-[#2c2250]' }[tone]
  return (
    <div role={tone === 'red' ? 'alert' : undefined} className={`label flex gap-2.5 rounded-2xl px-4 py-3 text-[13px] leading-snug ${t}`}>
      <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <div>{children}</div>
    </div>
  )
}

/** The status text is its own `role="status"` element; the explorer link sits beside it. */
export function Receipt({ hash, text }: { hash: string | null; text: string }) {
  if (!hash) return null
  return (
    <div className="label flex items-center justify-between gap-3 rounded-2xl bg-ok-soft px-4 py-3 text-[14px] text-ok">
      <span className="flex items-center gap-2">
        <CheckCircle2 className="size-4 shrink-0" aria-hidden="true" />
        <span role="status">{text}</span>
      </span>
      <a href={txUrl(hash)} target="_blank" rel="noopener noreferrer" className="inline-flex shrink-0 items-center gap-1 font-semibold underline underline-offset-2">
        View <ExternalLink className="size-3.5" aria-hidden="true" />
        <span className="sr-only">transaction on the explorer</span>
      </a>
    </div>
  )
}

/** The form's last button: handles connect, wrong chain, pending and disabled states. */
export function ActionButton({
  label,
  onClick,
  ready,
  phase,
  disabledReason,
}: {
  label: string
  onClick: () => void
  ready: boolean
  phase: TxPhase
  disabledReason?: string
}) {
  const w = useWallet()
  const base =
    'label inline-flex h-[52px] w-full items-center justify-center gap-2 rounded-[14px] bg-accent px-5 text-[16px] font-bold text-white transition hover:bg-accent-dark active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50'
  if (!w.account) {
    return (
      <button type="button" className={base} onClick={() => void w.connect()} disabled={w.connecting}>
        {w.connecting && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
        Connect a wallet
      </button>
    )
  }
  if (w.wrongChain) {
    return (
      <button type="button" className={base} onClick={() => void w.switchToArc()} disabled={w.switching}>
        {w.switching && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
        Switch network to Arc testnet
      </button>
    )
  }
  const busy = phase !== 'idle'
  return (
    <>
      <button type="button" className={base} onClick={onClick} disabled={!ready || busy}>
        {busy ? (
          <>
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            {phase === 'wallet' ? 'Confirm in your wallet…' : 'Confirming on Arc…'}
          </>
        ) : (
          label
        )}
      </button>
      {!ready && !busy && disabledReason && <p className="label -mt-1 text-center text-[13px] text-ink-2">{disabledReason}</p>}
    </>
  )
}
