import { useMemo, useState } from 'react'
import { formatUnits } from 'viem'
import { publicClient } from '../chain'
import { HOOK, SLIPPAGE_BPS, USDC_ASSET, erc20Abi, hookAbi } from '../config'
import { fmtShares, fmtToken, fmtUsd, parseInput } from '../format'
import { estimateJoinSingle, lossPct } from '../math'
import { useTx } from '../tx'
import { useAsync } from '../useAsync'
import { useFund } from '../useFund'
import { useWallet } from '../wallet'
import { ActionButton, AmountField, Receipt, Rows, TokenChip, Warn } from './TradeParts'

export function Buy() {
  const { data } = useFund()
  const { account, wrongChain } = useWallet()
  const tx = useTx()
  const [amount, setAmount] = useState('')
  const [done, setDone] = useState<string | null>(null)
  const [approved, setApproved] = useState<string | null>(null)

  const raw = parseInput(amount, USDC_ASSET.decimals)
  const balance = data?.wallet?.balances[3]
  const allowance = data?.wallet?.allowanceHookUsdc ?? 0n

  const est = useMemo(() => {
    if (!data || !raw || raw === 0n) return null
    return estimateJoinSingle({
      amountIn: raw,
      reserve: data.reserves[3],
      supply: data.supply,
      nav: data.nav,
      postedBps: data.postedBps,
      refPrices: data.refPrices,
      asset: 3,
    })
  }, [data, raw])

  const maxIn = data ? (data.reserves[3] * 3000n) / 10_000n : null
  const tooMuch = !!raw && balance !== undefined && raw > balance
  const overCap = !!est?.overCap
  const needsApproval = !!account && !!raw && raw > 0n && allowance < raw
  const stale = !!data && !data.fresh

  // Exact simulation, only once the allowance covers the amount.
  const canSim = !!account && !wrongChain && !!raw && raw > 0n && !needsApproval && !overCap && !tooMuch && !stale
  const sim = useAsync<bigint>(canSim ? `${account}|${raw}` : null, String(data?.block ?? 0), async () =>
    (await publicClient.simulateContract({ address: HOOK, abi: hookAbi, functionName: 'joinSingle', args: [USDC_ASSET.address, raw!, 0n], account: account! })).result,
  )
  const exact = sim.value
  const simError = sim.error

  const shares = exact ?? est?.shares ?? 0n
  const minShares = (shares * (10_000n - SLIPPAGE_BPS)) / 10_000n
  const worth = data && data.supply > 0n ? (shares * data.nav) / data.supply : 0n
  const paidUsd = raw ? raw * 10n ** 12n : 0n
  const loss = raw && shares > 0n ? lossPct(paidUsd, worth) : 0

  const approve = async () => {
    if (!raw) return
    setDone(null)
    const h = await tx.send({ address: USDC_ASSET.address, abi: erc20Abi, functionName: 'approve', args: [HOOK, raw] })
    if (h) setApproved(h)
  }
  const buy = async () => {
    if (!raw) return
    setDone(null)
    setApproved(null)
    const h = await tx.send({ address: HOOK, abi: hookAbi, functionName: 'joinSingle', args: [USDC_ASSET.address, raw, minShares] })
    if (h) {
      setDone(h)
      setAmount('')
    }
  }

  let reason: string | undefined
  if (!raw || raw === 0n) reason = 'Enter an amount'
  else if (stale) reason = 'Prices are stale'
  else if (tooMuch) reason = 'Not enough USDC'
  else if (overCap) reason = 'Over the 30% cap'
  else if (shares === 0n) reason = 'Amount too small'
  else if (simError) reason = 'Cannot buy right now'

  const postedFee = data ? ((data.postedBps * 0.75) / 100).toFixed(2) : null

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
        decimals={USDC_ASSET.decimals}
        right={<TokenChip symbol="USDC" color={USDC_ASSET.color} />}
        hint={maxIn !== null ? `Up to ${fmtToken(maxIn, 6)} USDC per buy right now, 30% of the fund's USDC.` : '30% of the fund\'s USDC per buy.'}
        balanceText={balance !== undefined ? `Balance ${fmtToken(balance, 6)}` : undefined}
        onMax={balance ? () => setAmount(formatUnits(balance, 6)) : undefined}
      />

      <Rows
        rows={[
          { k: exact !== null ? 'You get (simulated)' : 'You get', v: shares > 0n ? `${fmtShares(shares)} BSKT` : '–' },
          { k: 'Worth', v: shares > 0n ? fmtUsd(worth) : '–' },
          { k: 'Fee', v: postedFee !== null ? `${postedFee}%, the posted fee on the three quarters that become stocks` : '–' },
        ]}
      />
      {shares > 0n && (
        <p className="label px-1 text-[12px] text-ink-2">
          You will get at least {fmtShares(minShares)} BSKT (0.5% below{exact !== null ? ' the simulated result' : ' the estimate'}).
          {est?.capBound ? ' Shares are capped at the dollar value of your deposit at Chainlink prices.' : ''}
        </p>
      )}

      {needsApproval && !tooMuch && !overCap && !stale && (
        <Warn tone="lav">This is the estimate. Approve USDC first, then the preview switches to an exact simulation from the contract.</Warn>
      )}
      {stale && <Warn>Chainlink's prices are stale, so single-asset buys are paused until the next update.</Warn>}
      {overCap && maxIn !== null && <Warn tone="red">That is more than 30% of the fund's USDC. Try {fmtToken(maxIn, 6)} USDC or less.</Warn>}
      {loss > 2 && !overCap && !tooMuch && <Warn>You would receive shares worth {loss.toFixed(1)}% less than you pay, at Chainlink's prices.</Warn>}
      {simError && <Warn tone="red">{simError}</Warn>}
      {tx.error && <Warn tone="red">{tx.error}</Warn>}

      {needsApproval && !tooMuch && !overCap && !stale ? (
        <ActionButton label="Approve USDC" onClick={() => void approve()} ready phase={tx.phase} />
      ) : (
        <ActionButton label="Buy the basket" onClick={() => void buy()} ready={!reason} disabledReason={reason} phase={tx.phase} />
      )}
      <Receipt hash={done ?? approved} text={done ? 'Bought. Confirmed on Arc testnet' : 'USDC approved. Now buy.'} />
    </div>
  )
}
