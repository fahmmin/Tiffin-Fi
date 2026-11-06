import type { ReactNode } from 'react'
import { formatUnits } from 'viem'
import { txUrl } from '../config.ts'
import { amount, percent } from '../lib/format.ts'
import type { TxState } from '../lib/tx.ts'
import type { Wallet } from '../lib/wallet.ts'

type AmountFieldProps = {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  symbol: string
  decimals: number
  /** Asset index for the token dot; omit for BSKT. */
  asset?: number
  balance?: bigint
  /** Fills the field when "Use max" is pressed. */
  max?: bigint
  problem?: string
  children?: ReactNode
}

export function AmountField({ id, label, value, onChange, symbol, decimals, asset, balance, max, problem, children }: AmountFieldProps) {
  return (
    <div className={`amount${problem ? ' has-problem' : ''}`}>
      <div className="amount-top">
        <label htmlFor={id}>{label}</label>
        <span className="token-pill">
          <span className={`token-dot${asset === undefined ? ' is-bskt' : ` asset-${asset}`}`} aria-hidden="true" />
          {symbol}
        </span>
      </div>
      <input
        id={id}
        className="amount-input"
        inputMode="decimal"
        autoComplete="off"
        spellCheck={false}
        placeholder="0"
        value={value}
        onChange={(e) => onChange(e.target.value.replace(',', '.'))}
        aria-invalid={problem ? true : undefined}
        aria-describedby={problem ? `${id}-problem` : undefined}
      />
      <div className="amount-bottom">
        {balance !== undefined && (
          <span>
            You have {amount(balance, decimals)} {symbol}
          </span>
        )}
        {max !== undefined && max > 0n && (
          <button type="button" className="link-btn" onClick={() => onChange(formatUnits(max, decimals))}>
            Use max
          </button>
        )}
      </div>
      {children}
      {problem && (
        <p id={`${id}-problem`} className="field-problem">
          {problem}
        </p>
      )}
    </div>
  )
}

/** A sequence the person goes through, such as allow then buy. */
export function Steps({ steps, current }: { steps: string[]; current: number }) {
  return (
    <ol className="steps">
      {steps.map((s, i) => (
        <li key={s} aria-current={i === current ? 'step' : undefined} className={i < current ? 'is-done' : undefined}>
          <span className="step-num">{i + 1}</span>
          {s}
        </li>
      ))}
    </ol>
  )
}

/** The form's main button: connect first, then switch to Arc, then the action itself. */
export function ActionButton({ wallet, busy, disabled, label, onClick }: {
  wallet: Wallet
  busy: boolean
  disabled: boolean
  label: string
  onClick: () => void
}) {
  if (!wallet.address) {
    return (
      <button type="button" className="btn btn-primary btn-block" onClick={wallet.connect} disabled={wallet.connecting}>
        {wallet.connecting ? 'Connecting…' : 'Connect a wallet'}
      </button>
    )
  }
  if (!wallet.onArc) {
    return (
      <button type="button" className="btn btn-primary btn-block" onClick={wallet.requestArc}>
        Switch to Arc testnet
      </button>
    )
  }
  return (
    <button type="button" className="btn btn-primary btn-block" onClick={onClick} disabled={busy || disabled}>
      {busy ? 'Waiting for your wallet…' : label}
    </button>
  )
}

/** Wallet, pending, confirmed and failed states, each with its explorer link. Always mounted so it is announced. */
export function TxStatus({ state }: { state: TxState }) {
  const hash = 'hash' in state ? state.hash : undefined
  return (
    <div className={`tx is-${state.status}`} role="status" aria-live="polite">
      {state.status === 'signing' && <p>Confirm “{state.label}” in your wallet.</p>}
      {state.status === 'pending' && <p>{state.label}: sent, waiting for Arc to confirm.</p>}
      {state.status === 'confirmed' && <p>{state.label}: confirmed.</p>}
      {state.status === 'failed' && (
        <p>
          {state.label} did not go through. {state.message}
        </p>
      )}
      {hash && (
        <a href={txUrl(hash)} target="_blank" rel="noreferrer">
          View the transaction on the Arc explorer
        </a>
      )}
    </div>
  )
}

/** Flags a trade worth noticeably less than it costs at Chainlink's prices, which happens while the pools are off. */
export function ValueWarning({ paid, worth }: { paid: bigint; worth: bigint }) {
  const loss = paid > 0n && worth < paid ? 1 - Number(worth) / Number(paid) : 0
  if (loss < 0.02) return null
  return (
    <p className="note-bad">
      At Chainlink's prices you get {percent(loss, 1)} less than you put in, because the fund's pools are off Chainlink's
      prices right now. Trades that close that gap fix it.
    </p>
  )
}

/** Rows of a preview, as a definition list. */
export function Preview({ rows, note }: { rows: [string, ReactNode][]; note?: ReactNode }) {
  return (
    <div className="preview">
      <dl>
        {rows.map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      {note && <div className="preview-note">{note}</div>}
    </div>
  )
}
