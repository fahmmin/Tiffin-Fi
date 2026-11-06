import { Dot, PENDING, Pill } from '../ui'
import { fmtBps, fmtSharePrice, fmtUsd } from '../format'
import { useFund } from '../useFund'

const DOTS = 21

export function LiveFund() {
  const { data } = useFund()
  const swaps = data ? Number(data.swapCount) : null
  const lit = swaps === null ? 0 : Math.min(DOTS, swaps)
  const fig = (label: string, value: string | null, sub: string) => (
    <div className="min-w-0">
      <div className="label text-[13px] text-ink-2">{label}</div>
      <div className="display num mt-1 truncate text-[clamp(1.7rem,2.6vw,2.4rem)] leading-tight tracking-[-0.04em] text-accent-ink">{value ?? PENDING}</div>
      <div className="label text-[13px] text-ink-2">{sub}</div>
    </div>
  )
  return (
    <section id="live" className="scroll-mt-20" aria-labelledby="live-title">
      <div className="grid gap-2 lg:grid-cols-[1.45fr_1fr]">
        <div className="rounded-[32px] bg-white p-6 shadow-card sm:p-8">
          <div className="flex items-start justify-between gap-3">
            <h2 id="live-title" className="text-[clamp(1.6rem,2.4vw,2rem)] font-semibold tracking-[-0.04em]">
              The fund right now
            </h2>
            <Pill tone="grey">
              <Dot className="bg-ok" /> Arc testnet
            </Pill>
          </div>
          <div className="mt-6 grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-4">
            {fig('Fund value', data ? fmtUsd(data.nav) : null, "at Chainlink's prices")}
            {fig('One share', data ? fmtSharePrice(data.sharePrice) : null, 'of BSKT')}
            {fig('Fees earned', data ? fmtUsd(data.totalFeesUsd) : null, 'for holders')}
            {fig('Gap captured', data ? fmtUsd(data.gapCapturedUsd) : null, 'from bots')}
          </div>
          <p className="label mt-8 border-t border-line pt-4 text-[14px] leading-relaxed text-ink-2">
            Read live from the hook and the market clock on Arc testnet, block #{data ? data.block.toLocaleString('en-US') : PENDING}.
          </p>
        </div>

        <div className="on-dark relative overflow-hidden rounded-[32px] bg-deep p-6 text-white sm:p-8">
          <div className="grid-lines pointer-events-none absolute inset-0" aria-hidden="true" />
          <div className="relative">
            <div className="grid grid-cols-7 gap-2.5" role="img" aria-label={swaps === null ? 'Swap dots, loading' : `${Math.min(swaps, DOTS)} of ${DOTS} dots lit, one per swap so far`}>
              {Array.from({ length: DOTS }, (_, i) => (
                <span key={i} className={`aspect-square rounded-full ${i < lit ? 'bg-accent' : 'bg-deep-2'}`} />
              ))}
            </div>
            <div className="display mt-6 text-[clamp(2.6rem,5vw,4rem)] leading-none tracking-[-0.05em]">{data ? (data.marketOpen ? 'Open' : 'Closed') : PENDING}</div>
            <p className="label mt-2 text-[14px] leading-snug text-ondeep">
              Wall Street, per Chainlink CRE.
              <br />
              Swaps pay {data ? fmtBps(data.postedBps) : PENDING} now.
            </p>
            <p className="label mt-5 border-t border-white/10 pt-4 text-[16px] font-semibold leading-snug">
              {swaps === null ? PENDING : swaps} swaps so far, one dot each. Every one paid the fund.
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}
