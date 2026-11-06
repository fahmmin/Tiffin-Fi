import { ArrowUpRight } from 'lucide-react'
import { addressUrl } from '../chain'
import { HOOK } from '../config'
import { fmtUsd } from '../format'
import { ArrowCircle, PENDING } from '../ui'
import { useFund } from '../useFund'

/** Foundry tests in contracts/test: unit, fuzz and invariant. */
const FOUNDRY_TESTS = 114
const CRE_TX = 'https://explorer.testnet.arc.io/tx/0x11efa416c2514360c666bf0ff0641bf21ec07e5be9cf2a3f3a30cf0277a898bd'
const BIG = 'display num text-[clamp(2.4rem,5.6vw,4.6rem)] leading-none tracking-[-0.04em]'

export function Proof() {
  const { data } = useFund()
  return (
    <section id="proof" className="scroll-mt-20 px-1 py-12 sm:py-16" aria-labelledby="proof-title">
      <div className="mx-auto max-w-[1100px]">
        <div className="text-center">
          <h2 id="proof-title" className="text-[clamp(2.2rem,4.8vw,3.6rem)] font-semibold leading-none tracking-[-0.04em]">
            Tested on chain, not on slides.
          </h2>
          <p className="label mt-3 text-[16px] text-ink-2">Facts from our build, each with its source.</p>
        </div>

        <div className="mt-10 grid gap-2 md:grid-cols-2">
          <div className="flex min-h-[300px] flex-col rounded-[28px] bg-cyan p-6 sm:p-7">
            <div className="label text-[14px] font-bold">Gap captured</div>
            <div className={`${BIG} mt-5`}>{data ? fmtUsd(data.gapCapturedUsd) : PENDING}</div>
            <div className="mt-auto pt-8">
              <p className="label text-[16px] leading-snug">80% of each bot's edge stays in the fund.</p>
              <a
                href={addressUrl(HOOK)}
                target="_blank"
                rel="noopener noreferrer"
                className="label mt-2 inline-flex min-h-11 items-center gap-1 text-[15px] font-semibold underline underline-offset-4"
              >
                See the hook on the explorer <ArrowUpRight className="size-4" aria-hidden="true" />
              </a>
            </div>
          </div>

          <div className="flex min-h-[300px] flex-col rounded-[28px] bg-card p-6 sm:p-7">
            <div className="label text-[14px] font-bold">Contract tests</div>
            <div className={`${BIG} mt-5`}>{FOUNDRY_TESTS}</div>
            <div className="mt-5 flex flex-wrap gap-1.5" aria-hidden="true">
              {Array.from({ length: FOUNDRY_TESTS }, (_, i) => (
                <span key={i} className="size-3 rounded-[4px] bg-accent/80" />
              ))}
            </div>
            <p className="label mt-auto pt-6 text-[16px] leading-snug">Foundry tests in this repo: unit, fuzz and invariant.</p>
          </div>
        </div>

        <div className="on-dark mt-2 grid gap-2 rounded-[28px] bg-deep p-3 text-white md:grid-cols-2">
          <div className="flex flex-col p-4 sm:p-6">
            <div className="label text-[14px] font-semibold text-accent-deep">Chainlink CRE</div>
            <div className="display mt-4 text-[clamp(2.1rem,3.8vw,3.3rem)] leading-none tracking-[-0.04em] text-accent-deep">Report on chain</div>
            <p className="label mt-4 max-w-[440px] text-[16px] leading-relaxed text-ondeep">
              A CRE workflow run fetched live quotes, reached consensus and wrote the report to MarketClock through the CRE forwarder.
            </p>
            <a
              href={CRE_TX}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-6 inline-flex min-h-12 w-fit items-center gap-3 rounded-full bg-white py-1.5 pl-5 pr-1.5 text-[15px] font-semibold text-ink transition hover:bg-lav"
            >
              View the transaction
              <ArrowCircle tone="accent" />
            </a>
          </div>
          <div className="rounded-3xl bg-deep-2 p-6">
            <div className="label text-[14px] font-semibold text-ondeep">Checked on chain</div>
            <div className={`${BIG} mt-5`}>19</div>
            <p className="label mt-4 text-[16px] leading-relaxed text-ondeep">
              facts re-checked against the chain: the hook's address flags, owners, assets, both CRE forwarders and all six pools.
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}
