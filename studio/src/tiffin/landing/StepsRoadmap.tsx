import { Chip, NumBadge } from '../ui'

const STEPS = [
  { n: '01', t: 'Buy the basket with USDC.', b: 'One token holds Nvidia, Apple, Microsoft and USDC, a quarter each.' },
  { n: '02', t: 'Traders swap against it and pay fees.', b: 'Every swap pays at least the posted fee, and the fees stay in the fund.' },
  { n: '03', t: "Chainlink keeps the clock, so Monday's gap pays the fund.", b: "When Wall Street reopens, the gap fee keeps 80% of the first bot's edge." },
]

export function Steps() {
  return (
    <section id="steps" className="scroll-mt-20" aria-labelledby="steps-title">
      <div className="grid gap-2 lg:grid-cols-2">
        <div className="flex flex-col rounded-[32px] bg-card p-6 sm:p-9">
          <div className="grid gap-4 sm:grid-cols-[1.1fr_1fr]">
            <h2 id="steps-title" className="text-[clamp(2.2rem,4.8vw,3.6rem)] font-semibold leading-[0.98] tracking-[-0.04em]">
              How the basket works.
            </h2>
            <p className="label text-[16px] leading-relaxed text-ink-2">The same loop on every trading day, and over every weekend.</p>
          </div>
          <p className="label mt-10 text-[16px] leading-relaxed text-ink-2">
            <Chip className="mr-2 !bg-white align-middle">Illustration</Chip>
            On a $1M fund, a 5% Monday gap in Nvidia is worth about $228 to bots. The fund keeps $182.
          </p>
          <div className="mt-auto flex items-end gap-3 pt-10">
            <span className="display text-[clamp(5rem,10vw,8rem)] leading-[0.8] tracking-[-0.05em]">3</span>
            <span className="label pb-1 text-[16px] leading-snug text-ink-2">
              steps, and you only do
              <br />
              the first.
            </span>
          </div>
        </div>

        <div className="on-dark relative overflow-hidden rounded-[32px] bg-deep p-4 text-white sm:p-6">
          <div className="grid-lines pointer-events-none absolute inset-0" aria-hidden="true" />
          <div className="relative">
            <div className="label py-3 text-center text-[14px] text-ondeep">3 steps</div>
            <ol className="space-y-3">
              {STEPS.map((s, i) => (
                <li key={s.n} className={`flex gap-4 rounded-2xl p-5 ${i === 1 ? 'bg-accent' : 'bg-deep-2'}`}>
                  <NumBadge n={s.n} active={i === 1} dark />
                  <div>
                    <h3 className="text-[clamp(1.25rem,1.8vw,1.55rem)] font-semibold leading-tight tracking-[-0.035em]">{s.t}</h3>
                    <p className={`label mt-1.5 text-[15px] leading-snug ${i === 1 ? 'text-white/85' : 'text-ondeep'}`}>{s.b}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>
    </section>
  )
}

const NEXT = [
  { n: '01', t: 'Real tokenized stocks', b: 'Swap the test tokens for real ones, such as xStocks or Ondo, in the same reserve.' },
  { n: '02', t: 'Chainlink 24/7 prices', b: "Round-the-clock equity prices, so the fund can price the weekend and not only Monday's open." },
  { n: '03', t: 'More baskets and weights', b: 'Other sets of stocks and unequal weights, priced with the same weighted maths.' },
  { n: '04', t: 'A capped mainnet launch', b: 'A deposit cap while the contracts earn trust, after an audit.' },
]

export function Roadmap() {
  return (
    <section id="roadmap" className="scroll-mt-20 px-1 py-14 sm:py-20" aria-labelledby="roadmap-title">
      <div className="mx-auto max-w-[1100px]">
        <div className="flex flex-col items-center text-center">
          <Chip>After the hackathon</Chip>
          <h2 id="roadmap-title" className="mt-5 text-[clamp(2.2rem,4.8vw,3.6rem)] font-semibold leading-none tracking-[-0.04em]">
            Where the basket goes next.
          </h2>
        </div>
        <ol className="mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-4 lg:gap-6">
          {NEXT.map((x, i) => (
            <li key={x.n} className="border-t-2 border-ink pt-6">
              <NumBadge n={x.n} active={i === 0} />
              <h3 className="mt-6 text-[clamp(1.3rem,1.8vw,1.6rem)] font-semibold leading-tight tracking-[-0.035em]">{x.t}</h3>
              <p className="label mt-2 text-[15px] leading-relaxed text-ink-2">{x.b}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}
