import { useMemo, useState } from 'react'
import { formatUnits } from 'viem'
import { publicClient } from '../chain'
import { BSKT_DECIMALS, HOOK, SLIPPAGE_BPS, USDC_ASSET, hookAbi } from '../config'
import { fmtShares, fmtToken, fmtUsd, parseInput } from '../format'
import { estimateExitSingle, lossPct } from '../math'
import { useAsync } from '../useAsync'
import { useTx } from '../tx'
import { useFund } from '../useFund'
import { useWallet } from '../wallet'
import { ActionButton, AmountField, Receipt, Rows, Warn } from './TradeParts'

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

  const canSim = !!account && !wrongChain && !!raw && raw > 0n && !overCap && !tooMuch && !stale
  const sim = useAsync<bigint>(
    canSim ? `${account}|${raw}` : null,
    String(data?.block ?? 0),
    async () => (await publicClient.simulateContract({ address: HOOK, abi: hookAbi, functionName: 'exitSingle', args: [USDC_ASSET.address, raw!, 0n], account: account! })).result,
  )
  const exact = sim.value
  const simError = sim.error

  const out = exact ?? est?.out ?? 0n
  const minOut = (out * (10_000n - SLIPPAGE_BPS)) / 10_000n
  const sharesUsd = data && raw && data.supply > 0n ? (raw * data.nav) / data.supply : 0n
  const outUsd = out * 10n ** 12n
  const loss = out > 0n ? lossPct(sharesUsd, outUsd) : 0

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

  return (
    <div className="space-y-3">
      <AmountField
        label="You sell"
        symbol="BSKT"
        value={amount}
        onChange={(v) => {
          setAmount(v)
          setDone(null)
          tx.reset()
        }}
        decimals={BSKT_DECIMALS}
        balanceText={balance !== undefined ? `Balance ${fmtShares(balance)}` : undefined}
        onMax={balance ? () => setAmount(formatUnits(balance, 18)) : undefined}
      />
      <p className="label px-1 text-[12px] text-[#6b6878]">
        Single-asset cap: one sale can take at most 30% of the fund's USDC
        {data ? ` (${fmtToken(est?.maxOut ?? (data.reserves[3] * 3000n) / 10_000n, 6)} USDC right now).` : '.'}
      </p>

      <Rows
        rows={[
          { k: exact !== null ? 'You receive (simulated)' : 'You receive (estimate)', v: out > 0n ? `${fmtToken(out, 6)} USDC` : '—', strong: true },
          { k: 'Your shares are worth', v: sharesUsd > 0n ? fmtUsd(sharesUsd) : '—' },
          { k: 'Minimum you will accept (0.5% below)', v: out > 0n ? `${fmtToken(minOut, 6)} USDC` : '—' },
          { k: 'Posted fee on this sale', v: data ? `${((data.postedBps * 0.75) / 100).toFixed(3)}% (three quarters of ${(data.postedBps / 100).toFixed(2)}%), stays in the fund` : '—' },
        ]}
      />

      {stale && <Warn>Chainlink's prices are stale, so single-asset sales are paused until the next update.</Warn>}
      {overCap && <Warn tone="red">That is more than 30% of the fund's USDC. Sell fewer shares or swap into a stock instead.</Warn>}
      {loss > 2 && !overCap && <Warn>You would receive {loss.toFixed(1)}% less than your shares are worth at Chainlink's prices.</Warn>}
      {simError && <Warn tone="red">{simError}</Warn>}
      {tx.error && <Warn tone="red">{tx.error}</Warn>}

      <ActionButton label="Sell for USDC" onClick={() => void sell()} ready={!reason} disabledReason={reason} phase={tx.phase} />
      <Receipt hash={done ?? tx.hash} text="Confirmed on Arc testnet" />
    </div>
  )
}
