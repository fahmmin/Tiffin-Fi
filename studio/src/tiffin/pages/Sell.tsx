import { useMemo, useState } from 'react'
import { formatUnits } from 'viem'
import { publicClient } from '../chain'
import { BSKT_DECIMALS, HOOK, SLIPPAGE_BPS, USDC_ASSET, hookAbi } from '../config'
import { fmtShares, fmtToken, fmtUsd, parseInput } from '../format'
import { estimateExitSingle } from '../math'
import { useTx } from '../tx'
import { useAsync } from '../useAsync'
import { useFund } from '../useFund'
import { useWallet } from '../wallet'
import { ActionButton, AmountField, Receipt, Rows, TokenChip, Warn } from './TradeParts'

export function Sell() {
  const { data } = useFund()
  const { account, wrongChain } = useWallet()
  const tx = useTx()
  const [amount, setAmount] = useState('')
  const [done, setDone] = useState<string | null>(null)

  const raw = parseInput(amount, BSKT_DECIMALS)
  const balance = data?.wallet?.bskt
  const tooMuch = !!raw && balance !== undefined && raw > balance
  const stale = !!data && !data.fresh

  const est = useMemo(() => {
    if (!data || !raw || raw === 0n) return null
    return estimateExitSingle({
      shares: raw,
      reserve: data.reserves[3],
      supply: data.supply,
      nav: data.nav,
      postedBps: data.postedBps,
      refPrices: data.refPrices,
      asset: 3,
    })
  }, [data, raw])
  const overCap = !!est?.overCap
  const maxOut = data ? (data.reserves[3] * 3000n) / 10_000n : null

  const canSim = !!account && !wrongChain && !!raw && raw > 0n && !overCap && !tooMuch && !stale
  const sim = useAsync<bigint>(canSim ? `${account}|${raw}` : null, String(data?.block ?? 0), async () =>
    (await publicClient.simulateContract({ address: HOOK, abi: hookAbi, functionName: 'exitSingle', args: [USDC_ASSET.address, raw!, 0n], account: account! })).result,
  )
  const exact = sim.value
  const simError = sim.error

  const out = exact ?? est?.out ?? 0n
  const minOut = (out * (10_000n - SLIPPAGE_BPS)) / 10_000n
  const sharesUsd = data && raw && data.supply > 0n ? (raw * data.nav) / data.supply : 0n
  const outUsd = out * 10n ** 12n

  const sell = async () => {
    if (!raw) return
    setDone(null)
    const h = await tx.send({ address: HOOK, abi: hookAbi, functionName: 'exitSingle', args: [USDC_ASSET.address, raw, minOut] })
    if (h) {
      setDone(h)
      setAmount('')
    }
  }

  let reason: string | undefined
  if (!raw || raw === 0n) reason = 'Enter an amount'
  else if (stale) reason = 'Prices are stale'
  else if (tooMuch) reason = 'Not enough BSKT'
  else if (overCap) reason = 'Over the 30% cap'
  else if (out === 0n) reason = 'Amount too small'
  else if (simError) reason = 'Cannot sell right now'

  const postedFee = data ? ((data.postedBps * 0.75) / 100).toFixed(2) : null

  return (
    <div className="space-y-3">
      <AmountField
        label="You sell"
        value={amount}
        onChange={(v) => {
          setAmount(v)
          setDone(null)
          tx.reset()
        }}
        decimals={BSKT_DECIMALS}
        right={<TokenChip symbol="BSKT" color="#6e54ff" />}
        hint={maxOut !== null ? `Up to ${fmtToken(maxOut, 6)} USDC per sale right now, 30% of the fund's USDC.` : "30% of the fund's USDC per sale."}
        balanceText={balance !== undefined ? `Balance ${fmtShares(balance)}` : undefined}
        onMax={balance ? () => setAmount(formatUnits(balance, 18)) : undefined}
      />

      <Rows
        rows={[
          { k: exact !== null ? 'You get (simulated)' : 'You get', v: out > 0n ? `${fmtToken(out, 6)} USDC` : '–' },
          { k: 'Worth', v: sharesUsd > 0n ? `${fmtUsd(sharesUsd)} of shares` : '–' },
          { k: 'Fee', v: postedFee !== null ? `${postedFee}%, three quarters of the posted fee, left in the fund` : '–' },
        ]}
      />
      {out > 0n && <p className="label px-1 text-[12px] text-ink-2">You will get at least {fmtToken(minOut, 6)} USDC (0.5% below{exact !== null ? ' the simulated result' : ' the estimate'}).</p>}

      {stale && <Warn>Chainlink's prices are stale, so single-asset sales are paused until the next update.</Warn>}
      {overCap && <Warn tone="red">That is more than 30% of the fund's USDC. Sell fewer shares or swap into a stock instead.</Warn>}
      {simError && <Warn tone="red">{simError}</Warn>}
      {tx.error && <Warn tone="red">{tx.error}</Warn>}

      <ActionButton label="Sell for USDC" onClick={() => void sell()} ready={!reason} disabledReason={reason} phase={tx.phase} />
      <Receipt hash={done} text="Confirmed on Arc testnet" />
    </div>
  )
}
