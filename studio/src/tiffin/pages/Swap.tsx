import { useRef, useState } from 'react'
import { ArrowDownUp } from 'lucide-react'
import { formatUnits, type Address } from 'viem'
import { publicClient } from '../chain'
import { ASSETS, HOOK, ROUTER, SLIPPAGE_BPS, erc20Abi, hookAbi, routerAbi, type AssetInfo } from '../config'
import { fmtBps, fmtToken, fmtTokenDown, fmtUsd, parseInput } from '../format'
import { GAS_MESSAGE, overReserveCap, reserveCapMax, spendableUsdc } from '../guards'
import { valueUsd } from '../math'
import { parseTxError, useTx } from '../tx'
import { useAsync } from '../useAsync'
import { useFund } from '../useFund'
import { useWallet } from '../wallet'
import { ActionButton, AmountField, Receipt, Rows, Warn } from './TradeParts'

interface Quote {
  amountOut: bigint
  feeOut: bigint
  protocolFee: bigint
  feeUsd: bigint
  edgeUsd: bigint
  gapFee: bigint
  fresh: boolean
}
interface Key {
  currency0: Address
  currency1: Address
  fee: number
  tickSpacing: number
  hooks: Address
}

function TokenSelect({ value, onChange, exclude, label }: { value: number; onChange: (i: number) => void; exclude: number; label: string }) {
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className="display min-h-10 cursor-pointer rounded-full bg-white px-3.5 py-1.5 text-[15px] shadow-card outline-none focus-visible:ring-2 focus-visible:ring-accent"
    >
      {ASSETS.map((a) => (
        <option key={a.key} value={a.index} disabled={a.index === exclude}>
          {a.symbol}
        </option>
      ))}
    </select>
  )
}

export function Swap() {
  const { data } = useFund()
  const { account } = useWallet()
  const tx = useTx()
  const [from, setFrom] = useState(3)
  const [to, setTo] = useState(0)
  const [amount, setAmount] = useState('')
  const [done, setDone] = useState<string | null>(null)
  const [approved, setApproved] = useState<string | null>(null)
  const keys = useRef(new Map<string, Key>())

  const A: AssetInfo = ASSETS[from]
  const B: AssetInfo = ASSETS[to]
  const raw = parseInput(amount, A.decimals)
  const balance = data?.wallet?.balances[from]
  const allowance = data?.wallet?.allowanceRouter[from] ?? 0n
  const tooMuch = !!raw && balance !== undefined && raw > balance
  // Arc pays gas in USDC, so paying with USDC keeps a little back.
  const spendable = balance !== undefined && from === 3 ? spendableUsdc(balance) : balance
  const needsGas = from === 3 && !tooMuch && !!raw && spendable !== undefined && raw > spendable
  const reserveIn = data?.reserves[from]
  const overCap = !!raw && reserveIn !== undefined && overReserveCap(raw, reserveIn)
  const capMax = reserveIn !== undefined ? reserveCapMax(reserveIn) : 0n
  const needsApproval = !!account && !!raw && allowance < raw

  // hook.quote(), debounced, and re-read on every new block poll.
  const q = useAsync<Quote>(
    raw && raw > 0n ? `${A.address}|${B.address}|${raw}` : null,
    String(data?.block ?? 0),
    async () => (await publicClient.readContract({ address: HOOK, abi: hookAbi, functionName: 'quote', args: [A.address, B.address, raw!] })),
  )
  const quote = q.value
  const quoteError = q.error
  const quoting = q.pending

  const flip = () => {
    setFrom(to)
    setTo(from)
    setAmount('')
    setDone(null)
    tx.reset()
  }

  const pickFrom = (i: number) => {
    if (i === to) setTo(from)
    setFrom(i)
    setDone(null)
    setApproved(null)
  }
  const pickTo = (i: number) => {
    if (i === from) setFrom(to)
    setTo(i)
    setDone(null)
  }

  const minOut = quote ? (quote.amountOut * (10_000n - SLIPPAGE_BPS)) / 10_000n : 0n
  const gapBinds = !!quote && quote.gapFee > 0n && quote.protocolFee === 0n && quote.feeOut === quote.gapFee
  const fundFee = quote ? quote.feeOut - quote.protocolFee : 0n

  const inUsd = data && raw ? valueUsd(from, raw, data.refPrices) : 0n
  const outUsd = data && quote ? valueUsd(to, quote.amountOut, data.refPrices) : 0n
  const blocked = tooMuch || needsGas || overCap

  const doSwap = async () => {
    if (!raw || !account) return
    setDone(null)
    setApproved(null)
    let key = keys.current.get(`${A.key}-${B.key}`)
    try {
      if (!key) {
        const k = (await publicClient.readContract({ address: HOOK, abi: hookAbi, functionName: 'poolKey', args: [A.address, B.address] }))
        key = k
        keys.current.set(`${A.key}-${B.key}`, k)
      }
    } catch (e) {
      tx.setError(parseTxError(e))
      return
    }
    // zeroForOne is true when the input token is currency0 of the pool key.
    const zeroForOne = key.currency0.toLowerCase() === A.address.toLowerCase()
    const h = await tx.send({
      address: ROUTER,
      abi: routerAbi,
      functionName: 'swapExactInput',
      args: [key, zeroForOne, raw, minOut, account],
    })
    if (h) {
      setDone(h)
      setAmount('')
    }
  }

  const approve = async () => {
    if (!raw) return
    setDone(null)
    const h = await tx.send({ address: A.address, abi: erc20Abi, functionName: 'approve', args: [ROUTER, raw] })
    if (h) setApproved(h)
  }

  let reason: string | undefined
  if (!raw || raw === 0n) reason = 'Enter an amount'
  else if (tooMuch) reason = `Not enough ${A.symbol}`
  else if (needsGas) reason = 'Keep about 0.05 USDC for gas'
  else if (overCap) reason = `Over the 30% cap of the pool's ${A.symbol}`
  else if (quoting && !quote) reason = 'Getting a quote…'
  else if (quoteError) reason = 'No quote available'
  else if (!quote || quote.amountOut === 0n) reason = 'Amount too small'

  return (
    <div className="space-y-3">
      <AmountField
        label="You pay"
        value={amount}
        onChange={(v) => {
          setAmount(v)
          setDone(null)
          tx.reset()
        }}
        decimals={A.decimals}
        right={<TokenSelect value={from} onChange={pickFrom} exclude={to} label="Token you pay" />}
        balanceText={balance !== undefined ? `Balance ${fmtToken(balance, A.decimals)}` : undefined}
        onMax={spendable ? () => setAmount(formatUnits(spendable, A.decimals)) : undefined}
      />
      <div className="relative z-10 -my-4 flex justify-center">
        <button
          type="button"
          onClick={flip}
          aria-label="Swap the two tokens"
          className="grid size-11 place-items-center rounded-full border-4 border-white bg-ink text-white transition hover:bg-accent active:scale-95"
        >
          <ArrowDownUp className="size-4" aria-hidden="true" />
        </button>
      </div>
      <AmountField
        label="You receive"
        value={quote ? formatUnits(quote.amountOut, B.decimals) : ''}
        readOnly
        decimals={B.decimals}
        right={<TokenSelect value={to} onChange={pickTo} exclude={from} label="Token you receive" />}
        hint={quote ? `At least ${fmtToken(minOut, B.decimals)} ${B.symbol} (0.5% below)` : undefined}
      />

      <Rows
        rows={[
          { k: 'You get', v: quote ? `${fmtToken(quote.amountOut, B.decimals)} ${B.symbol}` : '–' },
          { k: 'Worth', v: quote && data ? fmtUsd(outUsd) : '–' },
          {
            k: 'Fee',
            v: quote
              ? `${fmtToken(quote.feeOut, B.decimals)} ${B.symbol} (${fmtUsd(quote.feeUsd)}), ${
                  quote.protocolFee > 0n
                    ? `fund ${fmtToken(fundFee, B.decimals)}, protocol ${fmtToken(quote.protocolFee, B.decimals)}`
                    : quote.feeOut > 0n
                      ? 'all of it to the fund'
                      : 'none'
                }`
              : data
                ? `${fmtBps(data.postedBps)} posted fee`
                : '–',
          },
        ]}
      />

      {gapBinds && quote && (
        <Warn tone="lav">
          You are buying {B.symbol} below its Chainlink reference price, an edge of {fmtUsd(quote.edgeUsd)}. 80% of that edge goes to the fund as the fee, and you keep the other 20%.
        </Warn>
      )}
      {quote && !quote.fresh && <Warn>Chainlink's prices are stale, so this swap pays the highest posted fee and no gap fee.</Warn>}
      {needsGas && <Warn tone="red">{GAS_MESSAGE}</Warn>}
      {overCap && (
        <Warn tone="red">
          That is more than 30% of the pool's {A.symbol}. Try {fmtTokenDown(capMax, A.decimals)} or less.
        </Warn>
      )}
      {quoteError && <Warn tone="red">{quoteError}</Warn>}
      {tx.error && <Warn tone="red">{tx.error}</Warn>}

      {needsApproval && !blocked && quote ? (
        <ActionButton label={`Approve ${A.symbol}`} onClick={() => void approve()} ready phase={tx.phase} />
      ) : (
        <ActionButton label={`Swap ${A.symbol} for ${B.symbol}`} onClick={() => void doSwap()} ready={!reason} disabledReason={reason} phase={tx.phase} />
      )}
      <Receipt hash={done ?? approved} text={done ? 'Swapped. Confirmed on Arc testnet' : `${A.symbol} approved. Now swap.`} />
      
    </div>
  )
}
