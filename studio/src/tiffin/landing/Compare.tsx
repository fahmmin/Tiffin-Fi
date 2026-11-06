import { Check, X } from 'lucide-react'
import { Chip, LogoMark } from '../ui'

const PLAIN = ['Charges you to rebalance', "Quotes Friday's price all weekend", "The first bot keeps Monday's gap", 'Fees go to a manager']
const BASKET = ['Traders pay it to rebalance', "Knows Wall Street's hours through Chainlink", 'Keeps 80% of the gap for holders', 'Fees stay in the fund']

export function Compare() {
  return (
    <section id="compare" className="on-dark relative scroll-mt-20 overflow-hidden rounded-[32px] bg-deep px-4 py-14 text-white sm:px-10 sm:py-20" aria-labelledby="compare-title">
      <div className="grid-lines pointer-events-none absolute inset-0" aria-hidden="true" />
      <div className="relative mx-auto max-w-[1000px]">
        <div className="flex flex-col items-center text-center">
          <Chip dark>Why use a basket</Chip>
          <h2 id="compare-title" className="mt-6 text-[clamp(2.2rem,4.8vw,3.6rem)] font-semibold leading-none tracking-[-0.04em]">
            Same stocks. <span className="text-accent-deep">The gap pays you.</span>
          </h2>
        </div>

        <div className="mt-12 grid gap-8 md:grid-cols-[1fr_auto_1fr] md:gap-4">
          <div>
            <div className="display rounded-2xl bg-deep-2 px-5 py-4 text-center text-[19px] text-ondeep">A plain fund or pool</div>
            <ul className="mt-5 space-y-3.5">
              {PLAIN.map((t) => (
                <li key={t} className="label flex items-center gap-3 text-[16px] text-ondeep">
                  <X className="size-4 shrink-0 text-pink" aria-hidden="true" />
                  <span className="sr-only">No: </span>
                  {t}
                </li>
              ))}
            </ul>
          </div>
          <div className="hidden items-start pt-3 md:flex">
            <span className="label grid size-11 place-items-center rounded-full bg-deep-2 text-[12px] font-bold text-ondeep">vs</span>
          </div>
          <div>
            <div className="display flex items-center justify-center gap-2.5 rounded-2xl bg-accent px-5 py-4 text-[19px] text-white">
              <LogoMark size={20} color="#fff" />
              This basket
            </div>
            <ul className="mt-5 space-y-3.5">
              {BASKET.map((t) => (
                <li key={t} className="label flex items-center gap-3 text-[16px] font-semibold text-white">
                  <Check className="size-4 shrink-0 text-accent-deep" aria-hidden="true" />
                  <span className="sr-only">Yes: </span>
                  {t}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-14 grid gap-4 md:grid-cols-2">
          <div className="rounded-3xl bg-deep-2 p-6">
            <div className="flex items-start justify-between gap-3">
              <div className="label text-[14px] text-ondeep">The bot's edge on a 5% Monday gap in Nvidia, on a $1M fund</div>
              <Chip dark className="shrink-0 !bg-deep">Illustration</Chip>
            </div>
            <div className="mt-4 h-2.5 rounded-full bg-white/10">
              <div className="h-full w-full rounded-full bg-pink" />
            </div>
            <div className="display num mt-4 text-[clamp(2.4rem,5.6vw,4.6rem)] leading-none tracking-[-0.04em]">$228</div>
            <p className="label mt-3 text-[15px] text-ondeep">Before any fee. A plain pool lets the bot keep nearly all of it.</p>
          </div>
          <div className="rounded-3xl bg-deep-2 p-6">
            <div className="flex items-start justify-between gap-3">
              <div className="label text-[14px] text-ondeep">What the bot keeps from this basket</div>
              <Chip dark className="shrink-0 !bg-deep">Illustration</Chip>
            </div>
            <div className="mt-4 h-2.5 rounded-full bg-white/10">
              <div className="h-full w-1/5 rounded-full bg-cyan" />
            </div>
            <div className="display num mt-4 text-[clamp(2.4rem,5.6vw,4.6rem)] leading-none tracking-[-0.04em]">$46</div>
            <p className="label mt-3 text-[15px] text-ondeep">The fund keeps $182, 80% of the edge, for its holders.</p>
          </div>
        </div>
      </div>
    </section>
  )
}
