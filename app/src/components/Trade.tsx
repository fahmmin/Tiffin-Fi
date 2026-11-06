import { useState } from 'react'
import { erc20Abi } from 'viem'
import { hookAbi } from '../abi/hook.ts'
import { ASSETS, HOOK, USDC, client } from '../config.ts'
import { estimateBuyShares, maxBuyUsdc, withSlippage, type Fund } from '../lib/basket.ts'
import { amount, bps, parseAmount, percent, usd } from '../lib/format.ts'
import { useDebounced } from '../lib/hooks.ts'
import { useTx } from '../lib/tx.ts'
import type { Wallet } from '../lib/wallet.ts'
import { ActionButton, AmountField, Preview, Steps, TxStatus, ValueWarning } from './Form.tsx'
import { SwapPanel } from './Swap.tsx'

type Props = { fund?: Fund; wallet: Wallet; refresh: () => void }
type Mode = 'buy' | 'sell' | 'swap'

const MODES: { id: Mode; label: string }[] = [
  { id: 'buy', label: 'Buy' },
  { id: 'sell', label: 'Sell' },
  { id: 'swap', label: 'Swap' },
]

const min = (a: bigint, b: bigint) => (a < b ? a : b)
const E18 = 10n ** 18n

export function Trade(props: Props) {
  const [mode, setMode] = useState<Mode>('buy')
  return (
    <div className="trade-grid">
      <section className="card trade-card" aria-label="Trade form">
        <div className="segmented" role="group" aria-label="Buy, sell or swap">
          {MODES.map((m) => (
            <button key={m.id} type="button" aria-pressed={mode === m.id} onClick={() => setMode(m.id)}>
              {m.label}
            </button>
          ))}
        </div>
        {mode === 'buy' && <Buy {...props} />}
        {mode === 'sell' && <Sell {...props} />}
        {mode === 'swap' && <SwapPanel {...props} />}
      </section>
      <TradeInfo mode={mode} fund={props.fund} />
    </div>
  )
}

/** The posted fee applies to the three quarters of a one-asset buy or sell that becomes the other assets. */
const singleAssetFee = (f?: Fund) => (f ? `${bps((f.postedFeeBps * 3) / 4)}, the posted fee on the three quarters that become stocks` : '—')

function TradeInfo({ mode, fund }: { mode: Mode; fund?: Fund }) {
  const posted = fund ? bps(fund.postedFeeBps) : 'the posted fee'
  const single = fund ? bps((fund.postedFeeBps * 3) / 4) : 'a share of the posted fee'
  const gapShare = fund ? percent(fund.fees.gapShare / 10_000, 0) : '80%'
  const items =
    mode === 'buy'
      ? [
          'You pay USDC and the fund mints BSKT: your share of all four slices.',
          `Three quarters of a one-asset buy becomes stocks, so that part pays the posted fee: ${single} now.`,
          `One buy can be at most 30% of the fund's USDC${fund ? `, ${amount(maxBuyUsdc(fund), 6)} USDC right now` : ''}.`,
          'Before you send it, the app simulates the buy on Arc and sets your minimum 0.5% below the result.',
        ]
      : mode === 'sell'
        ? [
            'The fund burns your BSKT and pays you USDC from its reserve.',
            "The payout is never more than your shares are worth at Chainlink's prices.",
            `The three quarters that come out of stocks pay the posted fee: ${single} now.`,
            'Selling needs no approval, so the preview is an exact simulation with your shares.',
          ]
        : [
            'Any two of the four assets, through the Uniswap v4 pool for that pair. All six pools trade against one reserve.',
            `You pay the larger of the posted fee (${posted} now) and the gap fee (${gapShare} of your edge at Chainlink's prices).`,
            'Posted fees: 90% to the fund and 10% to the protocol. Gap fees: all of it to the fund.',
            'The first time you pay with a token, you allow the router to take it, then you swap.',
          ]
  return (
    <aside className="card info-card" aria-labelledby="info-title">
      <h2 id="info-title">{mode === 'buy' ? 'How buying works' : mode === 'sell' ? 'How selling works' : 'How swaps are priced'}</h2>
      <ul className="info-list">
        {items.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ul>
    </aside>
  )
}

function Buy({ fund, wallet, refresh }: Props) {
  const [input, setInput] = useState('')
  const [approving, setApproving] = useState(false)
  const tx = useTx(refresh)
  const user = fund?.user
  const usdcIn = parseAmount(input, 6)
  const limit = fund ? maxBuyUsdc(fund) : 0n
  const balance = user?.balances[USDC]

  const problem =
    !fund || usdcIn === undefined
      ? undefined
      : usdcIn === 0n
        ? 'Enter an amount above zero.'
        : usdcIn > limit
          ? `One buy can be at most ${amount(limit, 6)} USDC, 30% of the USDC in the fund.`
          : balance !== undefined && usdcIn > balance
            ? `You have ${amount(balance, 6)} USDC.`
            : undefined
  const valid = !!fund && !!usdcIn && !problem
  const approved = valid && !!user && user.hookAllowance >= usdcIn

  // The exact preview is an eth_call of joinSingle, which needs the allowance; before that, an estimate.
  const sim = useDebounced(
    approved
      ? () =>
          client
            .simulateContract({ address: HOOK, abi: hookAbi, functionName: 'joinSingle', args: [USDC, usdcIn, 0n], account: user.address })
            .then((r) => r.result)
      : undefined,
    [approved, usdcIn, user?.address, fund?.readAt],
  )
  const shares = approved ? sim.value : valid ? estimateBuyShares(fund, usdcIn) : undefined
  const worth = shares !== undefined && fund ? (shares * fund.sharePriceUsd) / E18 : undefined

  async function submit() {
    if (!wallet.wallet || !user || !usdcIn) return
    if (!approved) {
      setApproving(true)
      await tx.run(`Allow ${amount(usdcIn, 6)} USDC`, () =>
        wallet.wallet!.writeContract({
          account: user.address,
          address: ASSETS[USDC].token,
          abi: erc20Abi,
          functionName: 'approve',
          args: [HOOK, usdcIn],
        }),
      )
      return
    }
    if (!sim.value) return
    const minShares = withSlippage(sim.value)
    const done = await tx.run('Buy BSKT', async () => {
      const { request } = await client.simulateContract({
        address: HOOK,
        abi: hookAbi,
        functionName: 'joinSingle',
        args: [USDC, usdcIn, minShares],
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
      <AmountField
        id="buy-amount"
        label="You pay"
        value={input}
        onChange={setInput}
        symbol="USDC"
        decimals={6}
        asset={USDC}
        balance={balance}
        max={fund && balance !== undefined ? min(balance, limit) : undefined}
        problem={problem ?? (approved ? sim.error : undefined)}
      >
        {fund && <p className="amount-hint">Up to {amount(limit, 6)} USDC per buy right now, 30% of the fund's USDC.</p>}
      </AmountField>

      <Preview
        rows={[
          ['You get', shares !== undefined ? `${approved ? '' : 'About '}${amount(shares, 18)} BSKT` : '—'],
          ['Worth', worth !== undefined ? `${usd(worth)} at the share price` : '—'],
          ['Fee', singleAssetFee(fund)],
          ...(approved && sim.value ? ([['At least', `${amount(withSlippage(sim.value), 18)} BSKT, or the buy is cancelled`]] as [string, string][]) : []),
        ]}
        note={
          <>
            {valid && !approved && (
              <p>This is an estimate. Once the fund may take your USDC, the app simulates the exact buy on Arc.</p>
            )}
            {valid && usdcIn && worth !== undefined && <ValueWarning paid={usdcIn * 10n ** 12n} worth={worth} />}
          </>
        }
      />

      {valid && user && (!approved || approving) && <Steps steps={['Allow USDC', 'Buy BSKT']} current={approved ? 1 : 0} />}

      <ActionButton
        wallet={wallet}
        busy={tx.busy}
        disabled={!valid || (approved && !sim.value) || sim.loading}
        label={!valid ? 'Enter an amount' : approved ? `Buy BSKT for ${amount(usdcIn, 6)} USDC` : `Allow ${amount(usdcIn, 6)} USDC`}
        onClick={submit}
      />
      <TxStatus state={tx.state} />
    </div>
  )
}

function Sell({ fund, wallet, refresh }: Props) {
  const [input, setInput] = useState('')
  const tx = useTx(refresh)
  const user = fund?.user
  const sharesIn = parseAmount(input, 18)

  const problem =
    !user || sharesIn === undefined
      ? undefined
      : sharesIn === 0n
        ? 'Enter an amount above zero.'
        : sharesIn > user.bskt
          ? `You have ${amount(user.bskt, 18)} BSKT.`
          : undefined
  const valid = !!user && !!sharesIn && !problem

  // Selling needs no approval: the hook burns your shares, so the exact preview always works.
  const sim = useDebounced(
    valid
      ? () =>
          client
            .simulateContract({ address: HOOK, abi: hookAbi, functionName: 'exitSingle', args: [USDC, sharesIn, 0n], account: user.address })
            .then((r) => r.result)
      : undefined,
    [valid, sharesIn, user?.address, fund?.readAt],
  )

  async function submit() {
    if (!wallet.wallet || !user || !sharesIn || !sim.value) return
    const minOut = withSlippage(sim.value)
    const done = await tx.run('Sell BSKT', async () => {
      const { request } = await client.simulateContract({
        address: HOOK,
        abi: hookAbi,
        functionName: 'exitSingle',
        args: [USDC, sharesIn, minOut],
        account: user.address,
      })
      return wallet.wallet!.writeContract(request)
    })
    if (done) setInput('')
  }

  return (
    <div className="form">
      {user ? (
        <AmountField
          id="sell-amount"
          label="You sell"
          value={input}
          onChange={setInput}
          symbol="BSKT"
          decimals={18}
          balance={user.bskt}
          max={user.bskt}
          problem={problem ?? sim.error}
        />
      ) : (
        <p className="empty">Connect your wallet to sell your BSKT.</p>
      )}
      {user && user.bskt === 0n && <p className="empty">You have no BSKT yet. Buy some with USDC first.</p>}

      {user && (
        <Preview
          rows={[
            ['You get', sim.value !== undefined ? `${amount(sim.value, 6)} USDC` : sim.loading ? 'Checking…' : '—'],
            ['Fee', singleAssetFee(fund)],
            ...(sim.value ? ([['At least', `${amount(withSlippage(sim.value), 6)} USDC, or the sale is cancelled`]] as [string, string][]) : []),
          ]}
          note={
            <>
              <p>Simulated on Arc with your wallet's shares, so this is the exact amount at the current prices.</p>
              {fund && sharesIn && sim.value !== undefined && (
                <ValueWarning paid={(sharesIn * fund.sharePriceUsd) / E18} worth={sim.value * 10n ** 12n} />
              )}
            </>
          }
        />
      )}

      <ActionButton
        wallet={wallet}
        busy={tx.busy}
        disabled={!valid || !sim.value || sim.loading}
        label={valid ? `Sell ${amount(sharesIn, 18)} BSKT` : 'Enter an amount'}
        onClick={submit}
      />
      <TxStatus state={tx.state} />
    </div>
  )
}
