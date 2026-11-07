import { ASSETS } from '../config'
import { ago, fmtBps, fmtPct, fmtSharePrice, fmtShares, fmtToken, fmtUsd, fmtUsdNum, timeIn, toNumber } from '../format'
import { valueUsd } from '../math'
import { Card, Dot, PENDING, Pill, Stat, useNow } from '../ui'
import { useFund } from '../useFund'
import { FundHistory } from './FundHistory'

function PriceNote({ pool, reference }: { pool: bigint; reference: bigint }) {
  if (pool === 0n || reference === 0n) return null
  const diff = ((toNumber(pool, 18) - toNumber(reference, 18)) / toNumber(reference, 18)) * 100
  if (Math.abs(diff) < 0.05) {
    return (
      <Pill tone="cyan">
        <Dot /> In line
      </Pill>
    )
  }
  return (
    <Pill tone="amber">
      <Dot /> Pool {fmtPct(Math.abs(diff))} {diff > 0 ? 'above' : 'below'}
    </Pill>
  )
}

export function FundPage() {
  const { data, chainNow } = useFund()
  const now = useNow(20_000)

  const values = data ? ASSETS.map((a) => valueUsd(a.index, data.reserves[a.index], data.refPrices)) : []
  const total = values.reduce((s, v) => s + v, 0n)
  const pct = (i: number) => (total > 0n ? Number((values[i] * 10000n) / total) / 100 : 0)

  const oldest = data ? Math.min(...data.priceTimes) : 0
  const age = data && oldest > 0 ? Math.max(0, chainNow() - oldest) : null
  const levels = [
    { id: 'open', label: 'Market open', bps: data?.openBps, active: !!data && data.fresh && data.marketOpen },
    { id: 'closed', label: 'Market closed', bps: data?.closedBps, active: !!data && data.fresh && !data.marketOpen },
    { id: 'stale', label: 'Prices stale', bps: data?.staleBps, active: !!data && !data.fresh },
  ]

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex items-start justify-between gap-3">
          <h2 className="display text-[26px] sm:text-[28px]">Stock Basket (BSKT)</h2>
          <Pill>
            <Dot /> Arc testnet
          </Pill>
        </div>
        <p className="label mt-2 max-w-2xl text-[15px] text-ink-2">
          Nvidia, Apple, Microsoft and USDC, a quarter each, in one token. Traders pay it to swap.
        </p>
        <div className="mt-5 grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-3">
          <Stat label="One share is worth" tone="accent">
            {data ? fmtSharePrice(data.sharePrice) : PENDING}
          </Stat>
          <Stat label="Fund value">{data ? fmtUsd(data.nav) : PENDING}</Stat>
          <Stat label="Shares issued">{data ? fmtShares(data.supply) : PENDING}</Stat>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="self-start">
          <div className="flex items-start justify-between gap-3">
            <h2 className="display text-[24px]">Wall Street's clock</h2>
          </div>
          <div className="mt-2">
            <Pill tone="grey">
              <Dot /> Wall Street {data ? (data.marketOpen ? 'open' : 'closed') : PENDING}
            </Pill>
          </div>
          <div className="label mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[14px] text-ink-2">
            <span>
              New York <b className="num font-semibold text-ink">{timeIn('America/New_York', now)}</b>
            </span>
            <span>
              Mumbai <b className="num font-semibold text-ink">{timeIn('Asia/Kolkata', now)}</b>
            </span>
          </div>
          <div className="label mt-5 text-[13px] text-ink-2">Posted fee on every swap</div>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {levels.map((l) => (
              <div key={l.id} aria-current={l.active ? 'true' : undefined} className={`rounded-2xl p-3 ${l.active ? 'bg-accent text-white' : 'bg-well'}`}>
                <div className={`label text-[12px] ${l.active ? 'text-white/85' : 'text-ink-2'}`}>{l.label}</div>
                <div className="display num mt-1 text-[20px] sm:text-[24px]">{l.bps !== undefined ? fmtBps(l.bps) : PENDING}</div>
              </div>
            ))}
          </div>
          <p className="label mt-4 text-[14px] text-ink-2">
            {!data
              ? PENDING
              : age === null
                ? 'Chainlink CRE has not sent prices yet.'
                : data.fresh
                  ? `Chainlink CRE updated Wall Street's prices ${ago(age)}.`
                  : `Prices are stale: Chainlink CRE last updated ${ago(age)}. Swaps pay the highest posted fee and single-asset trades are paused.`}
          </p>
        </Card>

        <Card>
          <h2 className="display text-[24px]">What traders have paid</h2>
          <div className="display num mt-3 text-[44px] leading-none text-accent-ink sm:text-[52px]">{data ? fmtUsd(data.totalFeesUsd) : PENDING}</div>
          <p className="label mt-3 text-[14px] text-ink-2">Fees earned for holders. They stay in the reserve, so each share redeems for more.</p>
          <dl className="label mt-4 divide-y divide-line text-[15px]">
            <div className="flex items-center justify-between py-3">
              <dt className="text-ink-2">Gap captured from bots</dt>
              <dd className="num font-semibold">{data ? fmtUsd(data.gapCapturedUsd) : PENDING}</dd>
            </div>
            <div className="flex items-center justify-between py-3">
              <dt className="text-ink-2">Protocol share</dt>
              <dd className="num font-semibold">{data ? fmtUsd(data.protocolEarnedUsd) : PENDING}</dd>
            </div>
            <div className="flex items-center justify-between py-3">
              <dt className="text-ink-2">Swaps</dt>
              <dd className="num font-semibold">{data ? data.swapCount.toString() : PENDING}</dd>
            </div>
          </dl>
          <p className="label mt-2 text-[13px] text-ink-2">Gap fees go entirely to holders, so they are part of the figure above.</p>
        </Card>
      </div>

      <Card>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="display text-[24px]">What the fund holds</h2>
          <span className="label text-[13px] text-ink-2">A quarter each by value</span>
        </div>
        <div
          className="mt-4 flex h-2.5 gap-0.5 overflow-hidden rounded-full"
          role="img"
          aria-label={data ? ASSETS.map((a) => `${a.name} ${fmtPct(pct(a.index), 1)}`).join(', ') : 'Fund split, loading'}
        >
          {ASSETS.map((a) => (
            <div key={a.key} className="h-full" style={{ background: data ? a.color : '#e6e6ea', flex: data && total > 0n ? Math.max(pct(a.index), 1) : 1 }} />
          ))}
        </div>
        <ul className="mt-2 divide-y divide-line">
          {ASSETS.map((a) => (
            <li key={a.key} className="flex items-start justify-between gap-4 py-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2.5">
                  <span className="size-3 shrink-0 rounded-full" style={{ background: a.color }} aria-hidden="true" />
                  <span className="display text-[18px]">{a.name}</span>
                </div>
                <div className="label num mt-1 text-[14px] text-ink-2">{data ? `${fmtToken(data.reserves[a.index], a.decimals)} ${a.symbol}` : PENDING}</div>
                {a.index < 3 && (
                  <div className="label mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-ink-2">
                    {data ? (
                      <>
                        <span className="num">
                          Pool {fmtUsdNum(toNumber(data.poolPrices[a.index], 18))}, Chainlink {fmtUsdNum(toNumber(data.refPrices[a.index], 18))}
                        </span>
                        <PriceNote pool={data.poolPrices[a.index]} reference={data.refPrices[a.index]} />
                      </>
                    ) : (
                      PENDING
                    )}
                  </div>
                )}
              </div>
              <div className="shrink-0 text-right">
                <div className="display num text-[18px]">{data ? fmtUsd(values[a.index]) : PENDING}</div>
                <div className="label num mt-1 text-[14px] text-ink-2">{data ? fmtPct(pct(a.index), 1) : PENDING}</div>
              </div>
            </li>
          ))}
        </ul>
      </Card>

      <FundHistory />
    </div>
  )
}
