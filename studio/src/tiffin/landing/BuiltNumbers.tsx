import { PENDING } from '../ui'
import { useFund } from '../useFund'

export function BuiltWith() {
  return (
    <section aria-labelledby="built-with" className="px-1 py-8">
      <div className="mx-auto flex max-w-[1100px] flex-wrap items-center justify-center gap-x-9 gap-y-4">
        <h2 id="built-with" className="label !tracking-normal text-[14px] font-medium text-ink-2">
          Built with
        </h2>
        <ul className="flex flex-wrap items-center justify-center gap-x-9 gap-y-3 text-ink">
          <li className="font-display text-[26px] font-bold tracking-[-0.04em]">Arc</li>
          <li className="font-display text-[20px] font-semibold tracking-[-0.03em]">Arc Studio</li>
          <li className="font-display text-[22px] font-semibold tracking-[-0.04em]">Uniswap v4</li>
          <li className="font-display text-[21px] font-bold tracking-[-0.03em]">Chainlink CRE</li>
          <li className="font-serif text-[26px] tracking-tight">Foundry</li>
          <li className="font-display text-[22px] font-bold tracking-[-0.03em]">viem</li>
        </ul>
      </div>
    </section>
  )
}

const FIG = 'display num text-[clamp(2.4rem,5.6vw,4.6rem)] leading-none tracking-[-0.04em]'

function Link({ href, children }: { href: string; children: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
      {children}
    </a>
  )
}

export function Numbers() {
  const { data } = useFund()
  return (
    <section aria-label="The numbers" className="px-1 py-10 sm:py-14">
      <div className="mx-auto grid max-w-[1100px] gap-10 text-center sm:grid-cols-2 lg:grid-cols-4 lg:gap-6">
        <div>
          <div className={FIG}>59%</div>
          <p className="label mx-auto mt-4 max-w-[250px] text-[15px] leading-snug text-ink-2">
            of Robinhood Chain stock-token DEX volume traded outside regular US hours, 24 Sep to 23 Oct 2026.{' '}
            <Link href="https://cryptobriefing.com/robinhood-chain-stock-tokens-after-hours-trading/">Crypto Briefing</Link>
          </p>
        </div>
        <div>
          <div className={FIG}>$20.9B</div>
          <p className="label mx-auto mt-4 max-w-[250px] text-[15px] leading-snug text-ink-2">
            of tokenized-stock DEX volume in the 30 days to 28 Sep, about 60% of it on Uniswap.{' '}
            <Link href="https://cryptobriefing.com/uniswap-tokenized-stock-deposits-defi/">Crypto Briefing</Link>
          </p>
        </div>
        <div>
          <div className={FIG}>
            6<span className="label ml-1 align-super text-[15px] font-semibold tracking-normal text-accent-ink">pools</span>
          </div>
          <p className="label mx-auto mt-4 max-w-[250px] text-[15px] leading-snug text-ink-2">trade against 1 reserve in this fund, one per pair of the four assets.</p>
        </div>
        <div>
          <div className={FIG}>{data ? `${data.gapShareBps / 100}%` : PENDING}</div>
          <p className="label mx-auto mt-4 max-w-[250px] text-[15px] leading-snug text-ink-2">of the gap kept for holders, read from the hook on Arc.</p>
        </div>
      </div>
    </section>
  )
}
