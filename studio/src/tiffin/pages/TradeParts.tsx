import type { ReactNode } from 'react'
import { AlertTriangle, CheckCircle2, ExternalLink, Loader2 } from 'lucide-react'
import { txUrl } from '../chain'
import { sanitizeInput } from '../format'
import type { TxPhase } from '../tx'
import { Button } from '../ui'
import { useWallet } from '../wallet'

export function AmountField({
  label,
  symbol,
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
  symbol: string
  value: string
  onChange?: (v: string) => void
  decimals: number
  balanceText?: string
  onMax?: () => void
  right?: ReactNode
  readOnly?: boolean
  hint?: string
}) {
  const id = `amt-${label.replace(/\W+/g, '-').toLowerCase()}`
  return (
    <div className="rounded-3xl bg-[#F4F3F8] p-4 focus-within:ring-2 focus-within:ring-accent">
      <div className="flex items-center justify-between gap-3">
        <label htmlFor={id} className="label text-[13px] text-[#55526a]">
          {label}
        </label>
        {balanceText && (
          <button
            type="button"
            onClick={onMax}
            disabled={!onMax}
            className="label min-h-8 rounded-full px-2 text-[12px] font-medium text-accent-dark hover:bg-lav disabled:cursor-default disabled:text-[#6b6878] disabled:hover:bg-transparent"
          >
            {balanceText}
            {onMax ? ' · Max' : ''}
          </button>
        )}
      </div>
      <div className="mt-1 flex items-center gap-3">
        <input
          id={id}
          inputMode="decimal"
          autoComplete="off"
          placeholder="0.00"
          value={value}
          readOnly={readOnly}
          onChange={(e) => onChange?.(sanitizeInput(e.target.value, decimals))}
          className="display num min-w-0 flex-1 bg-transparent text-[34px] leading-tight text-ink outline-none placeholder:text-[#b9b6c8] focus-visible:outline-none"
        />
        {right ?? <span className="display rounded-full bg-white px-3.5 py-1.5 text-[15px]">{symbol}</span>}
      </div>
      {hint && <div className="label mt-1 text-[12px] text-[#6b6878]">{hint}</div>}
    </div>
  )
}

export function Rows({ rows }: { rows: { k: string; v: ReactNode; strong?: boolean }[] }) {
  return (
    <dl className="label divide-y divide-[#ECEBF1] rounded-3xl border border-[#E8E7EE] px-4 text-[14px]">
      {rows.map((r) => (
        <div key={r.k} className="flex items-start justify-between gap-4 py-2.5">
          <dt className="text-[#55526a]">{r.k}</dt>
          <dd className={`num text-right ${r.strong ? 'font-semibold text-ink' : 'text-ink'}`}>{r.v}</dd>
        </div>
      ))}
    </dl>
  )
}

export function Warn({ children, tone = 'amber' }: { children: ReactNode; tone?: 'amber' | 'red' | 'lav' }) {
  const t = { amber: 'bg-[#FFF3DC] text-[#6B4500]', red: 'bg-[#FFE9E9] text-[#8C1C1C]', lav: 'bg-lav text-[#2c2250]' }[tone]
  return (
    <div role={tone === 'red' ? 'alert' : 'status'} className={`label flex gap-2.5 rounded-2xl px-4 py-3 text-[13px] leading-snug ${t}`}>
      <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <div>{children}</div>
    </div>
  )
}

export function Receipt({ hash, text }: { hash: string | null; text: string }) {
  if (!hash) return null
  return (
    <div role="status" className="label flex items-center justify-between gap-3 rounded-2xl bg-[#E6F7EC] px-4 py-3 text-[14px] text-[#14693A]">
      <span className="flex items-center gap-2">
        <CheckCircle2 className="size-4" aria-hidden="true" />
        {text}
      </span>
      <a href={txUrl(hash)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium underline underline-offset-2">
        View <ExternalLink className="size-3.5" aria-hidden="true" />
      </a>
    </div>
  )
}

/** The one primary button: handles connect, wrong chain, pending and disabled states. */
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
  if (!w.account) {
    return (
      <Button full onClick={() => void w.connect()} loading={w.connecting}>
        Connect wallet
      </Button>
    )
  }
  if (w.wrongChain) {
    return (
      <Button full onClick={() => void w.switchToArc()} loading={w.switching}>
        Switch to Arc testnet
      </Button>
    )
  }
  const busy = phase !== 'idle'
  return (
    <Button full onClick={onClick} disabled={!ready || busy}>
      {busy ? (
        <>
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          {phase === 'wallet' ? 'Confirm in your wallet…' : 'Confirming on Arc…'}
        </>
      ) : ready ? (
        label
      ) : (
        (disabledReason ?? label)
      )}
    </Button>
  )
}
