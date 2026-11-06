import { Card, Pill } from '../ui'
import { useFund } from '../useFund'
import { fmtBps } from '../format'

const POINTS = [
  {
    n: '01',
    title: 'One hook runs six pools from one shared reserve',
    body: 'Nvidia, Apple, Microsoft and USDC make six pairs. All six Uniswap v4 pools are served by a single hook, and none of them holds liquidity of its own. The fund keeps one reserve of each asset, and every pair trades against it.',
  },
  {
    n: '02',
    title: 'The maths is plain x*y=k',
    body: "Balancer's equal-weight formula collapses to the constant-product rule for any two assets: you receive reserveOut times amountIn, divided by reserveIn plus amountIn. Nothing exotic, and a trade across two stocks is still one hop.",
  },
  {
    n: '03',
    title: 'The fee is the larger of two numbers',
    body: "Every swap pays the posted fee (0.30% while Wall Street is open, 0.60% while it is closed, 2% when Chainlink's prices are stale) or 80% of the trade's edge against Chainlink's reference prices, whichever is bigger. Edge is what the trader gets out, valued at the reference price, minus what they put in. The posted fee splits 90% to the fund and 10% to the protocol. The gap fee goes entirely to the fund.",
  },
  {
    n: '04',
    title: 'Monday morning pays the fund',
    body: "When the market reopens, the pool still shows Friday's prices while Chainlink says the stocks moved. The first bot to trade the difference keeps 20% of its edge and the fund keeps 80%. Because the fee is a share of the edge, closing the whole gap is still the bot's best trade, and slicing it into pieces does not lower what the fund collects.",
  },
]

export function HowPage() {
  const { data } = useFund()
  return (
    <div className="mx-auto max-w-[860px] space-y-4">
      <Card>
        <h2 className="display text-[26px] sm:text-[30px]">How the fund gets paid</h2>
        <p className="label mt-2 text-[15px] text-[#55526a]">
          Tiffin Fi is a basket token whose reserves also work as exchange liquidity. Traders pay to use it, and holders collect.
        </p>
        {data && (
          <div className="mt-4 flex flex-wrap gap-2">
            <Pill tone="cyan">Open {fmtBps(data.openBps)}</Pill>
            <Pill tone="grey">Closed {fmtBps(data.closedBps)}</Pill>
            <Pill tone="amber">Stale {fmtBps(data.staleBps)}</Pill>
            <Pill tone="lav">Gap fee 80% of edge</Pill>
          </div>
        )}
      </Card>

      {POINTS.map((p) => (
        <Card key={p.n}>
          <div className="flex gap-4">
            <span className="display num text-[28px] text-accent">{p.n}</span>
            <div>
              <h3 className="display text-[21px] leading-tight">{p.title}</h3>
              <p className="label mt-2 text-[15px] leading-relaxed text-[#55526a]">{p.body}</p>
            </div>
          </div>
        </Card>
      ))}

      <section className="rounded-3xl bg-ink p-5 text-white sm:p-7" aria-labelledby="illus">
        <Pill tone="lav">Illustration, not a forecast</Pill>
        <h3 id="illus" className="display mt-3 text-[24px] leading-tight sm:text-[28px]">A 5% Monday gap on a $1M fund</h3>
        <p className="label mt-2 max-w-xl text-[15px] leading-relaxed text-white/75">
          Suppose the market reopens 5% above Friday's prices and the fund holds $1,000,000. That gap is worth about $228 to the bots that trade it. At 80%, the fund keeps about $182 of it, and the bots keep the rest. These are made-up round numbers to show the mechanism. The fund today is much smaller, and real gaps vary.
        </p>
        <div className="mt-5 grid grid-cols-2 gap-3">
          <div className="rounded-2xl bg-white/10 p-4">
            <div className="label text-[12px] text-white/70">Worth to bots</div>
            <div className="display num text-[30px]">about $228</div>
          </div>
          <div className="rounded-2xl bg-white/10 p-4">
            <div className="label text-[12px] text-white/70">Fund keeps (80%)</div>
            <div className="display num text-[30px] text-cyan">about $182</div>
          </div>
        </div>
      </section>
    </div>
  )
}
