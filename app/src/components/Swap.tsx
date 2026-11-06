import { useState } from 'react'
import { erc20Abi } from 'viem'
import { hookAbi } from '../abi/hook.ts'
import { routerAbi } from '../abi/router.ts'
import { ASSETS, HOOK, ROUTER, USDC, client } from '../config.ts'
import { poolKey, valueUsd, withSlippage, type Fund } from '../lib/basket.ts'
import { amount, bps, parseAmount, percent, usd } from '../lib/format.ts'
import { useDebounced } from '../lib/hooks.ts'
import { useTx, wrappedErrorAbi } from '../lib/tx.ts'
import type { Wallet } from '../lib/wallet.ts'
import { ActionButton, AmountField, Preview, Steps, TxStatus, ValueWarning } from './Form.tsx'

type Props = { fund?: Fund; wallet: Wallet; refresh: () => void }
type Quote = Awaited<ReturnType<typeof readQuote>>

const routerCallAbi = [...routerAbi, ...wrappedErrorAbi]

const readQuote = (assetIn: number, assetOut: number, amountIn: bigint) =>
  client.readContract({ address: HOOK, abi: hookAbi, functionName: 'quote', args: [assetIn, assetOut, amountIn] })

function AssetPicker({ name, legend, value, onPick }: { name: string; legend: string; value: number; onPick: (i: number) => void }) {
  return (
    <fieldset className="picker">
      <legend>{legend}</legend>
      {ASSETS.map((a, i) => (
        <label key={a.symbol}>
          <input type="radio" name={name} checked={value === i} onChange={() => onPick(i)} />
          <span>
            <span className={`token-dot asset-${i}`} aria-hidden="true" />
            {a.symbol}
          </span>
        </label>
      ))}
    </fieldset>
  )
}

export function SwapPanel({ fund, wallet, refresh }: Props) {
  const [from, setFrom] = useState(USDC)
  const [to, setTo] = useState(0)
  const [input, setInput] = useState('')
  const [approving, setApproving] = useState(false)
  const tx = useTx(refresh)
  const a = ASSETS[from]
  const b = ASSETS[to]
  const user = fund?.user
  const amountIn = parseAmount(input, a.decimals)
  const balance = user?.balances[from]

  const problem =
    amountIn === undefined
      ? undefined
      : amountIn === 0n
        ? 'Enter an amount above zero.'
        : balance !== undefined && amountIn > balance
          ? `You have ${amount(balance, a.decimals)} ${a.symbol}.`
          : undefined
  const valid = !!amountIn && !problem
  const quote = useDebounced(valid ? () => readQuote(from, to, amountIn) : undefined, [valid, from, to, amountIn], fund?.readAt)
  const q = quote.value
  const approved = valid && !!user && user.routerAllowances[from] >= amountIn

  const pick = (side: 'from' | 'to', i: number) => {
    // Picking the asset already on the other side swaps the two.
    if (side === 'from') {
      if (i === to) setTo(from)
      setFrom(i)
    } else {
      if (i === from) setFrom(to)
      setTo(i)
    }
    setInput('')
    setApproving(false)
  }

  async function submit() {
    if (!wallet.wallet || !user || !amountIn || !q) return
    if (!approved) {
      setApproving(true)
      await tx.run(`Allow ${amount(amountIn, a.decimals)} ${a.symbol}`, () =>
        wallet.wallet!.writeContract({
          account: user.address,
          address: a.token,
          abi: erc20Abi,
          functionName: 'approve',
          args: [ROUTER, amountIn],
        }),
      )
      return
    }
    const key = poolKey(from, to)
    const minOut = withSlippage(q.amountOut)
    const done = await tx.run(`Swap ${a.symbol} for ${b.symbol}`, async () => {
      const { request } = await client.simulateContract({
        address: ROUTER,
        abi: routerCallAbi,
        functionName: 'swapExactIn',
        args: [key, key.currency0 === a.token, amountIn, minOut, user.address],
        account: user.address,
      })
      return wallet.wallet!.writeContract(request)
    })
    if (done) {
      setInput('')
      setApproving(false)
    }
  }

  return (
    <div className="form">
      <AssetPicker name="swap-from" legend="Pay with" value={from} onPick={(i) => pick('from', i)} />
      <AmountField
        id="swap-amount"
        label="You pay"
        value={input}
        onChange={setInput}
        symbol={a.symbol}
        decimals={a.decimals}
        asset={from}
        balance={balance}
        max={balance}
        problem={problem ?? quote.error}
      />
      <button
        type="button"
        className="flip"
        onClick={() => {
          setFrom(to)
          setTo(from)
          setInput('')
          setApproving(false)
        }}
      >
        Swap the two sides
      </button>
      <AssetPicker name="swap-to" legend="Receive" value={to} onPick={(i) => pick('to', i)} />

      <Preview
        rows={[
          ['You receive', q ? `${amount(q.amountOut, b.decimals)} ${b.symbol}` : quote.loading ? 'Checking…' : '—'],
          ...(q && fund && amountIn ? quoteRows(fund, q, from, to, amountIn) : []),
        ]}
        note={
          q && fund && amountIn ? (
            <>
              <QuoteNote fund={fund} q={q} assetOut={to} />
              <ValueWarning paid={valueUsd(fund, from, amountIn)} worth={valueUsd(fund, to, q.amountOut)} />
            </>
          ) : undefined
        }
      />

      {valid && user && q && (!approved || approving) && <Steps steps={[`Allow ${a.symbol}`, 'Swap']} current={approved ? 1 : 0} />}

      <ActionButton
        wallet={wallet}
        busy={tx.busy}
        disabled={!valid || !q || q.amountOut === 0n}
        label={!valid ? 'Enter an amount' : approved ? `Swap ${a.symbol} for ${b.symbol}` : `Allow ${amount(amountIn, a.decimals)} ${a.symbol}`}
        onClick={submit}
      />
      <TxStatus state={tx.state} />
      {from !== USDC && user && user.balances[from] === 0n && (
        <p className="muted small">
          You have no {a.symbol} yet. Stock tokens are testnet stand-ins only the deployer can mint, so get some by paying with
          USDC first.
        </p>
      )}
    </div>
  )
}

function quoteRows(fund: Fund, q: Quote, from: number, to: number, amountIn: bigint): [string, string][] {
  const b = ASSETS[to]
  // protocolFee is in the output token; its USD share is proportional to the fee's.
  const protocolUsd = q.feeOut > 0n ? (q.feeUsd * q.protocolFee) / q.feeOut : 0n
  return [
    ['Worth', `${usd(valueUsd(fund, to, q.amountOut))} at Chainlink's prices, for ${usd(valueUsd(fund, from, amountIn))} paid`],
    [
      q.gapFee ? 'Gap fee' : 'Posted fee',
      q.gapFee
        ? `${usd(q.feeUsd)}, all of it to the fund`
        : `${usd(q.feeUsd)}: ${usd(q.feeUsd - protocolUsd)} to the fund, ${usd(protocolUsd)} to the protocol`,
    ],
    ['At least', `${amount(withSlippage(q.amountOut), b.decimals)} ${b.symbol}, or the swap is cancelled`],
  ]
}

function QuoteNote({ fund, q, assetOut }: { fund: Fund; q: Quote; assetOut: number }) {
  const symbol = ASSETS[assetOut].symbol
  if (!q.fresh) {
    return <p>Chainlink's prices are stale, so this swap pays the {bps(fund.fees.stale)} stale-price fee and no edge is measured.</p>
  }
  if (q.gapFee) {
    return (
      <p>
        <span className="pill pill-gap">Gap fee</span> You are buying {symbol} below Chainlink's reference price, so this
        trade has an edge of {usd(q.edgeUsd)}. The fund keeps {percent(Number(q.feeUsd) / Number(q.edgeUsd || 1n), 0)} of
        that edge for its holders and you keep the rest.
      </p>
    )
  }
  return (
    <p>
      The posted fee is {bps(fund.postedFeeBps)} while Wall Street is {fund.marketOpen ? 'open' : 'closed'}. It beat the gap
      fee here because this trade has {q.edgeUsd > 0n ? `only a ${usd(q.edgeUsd)} edge` : 'no edge'} at Chainlink's prices.
    </p>
  )
}
