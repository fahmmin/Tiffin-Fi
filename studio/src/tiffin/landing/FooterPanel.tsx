import { APP_ROUTES, href } from '../route'
import { CtaLink } from '../ui'

export function FooterPanel() {
  return (
    <footer className="on-dark relative overflow-hidden rounded-[32px] bg-deep px-5 pb-8 pt-12 text-white sm:px-10 sm:pt-16">
      <div className="grid-lines pointer-events-none absolute inset-0" aria-hidden="true" />
      <div className="relative">
        <div className="flex flex-col justify-between gap-8 sm:flex-row">
          <div>
            <p className="text-[clamp(2rem,3.4vw,3rem)] font-semibold leading-[1.02] tracking-[-0.04em]">
              Your index fund,
              <br />
              paid to rebalance.
            </p>
            <div className="mt-6">
              <CtaLink href={href('fund')} variant="ondark">
                Open app
              </CtaLink>
            </div>
          </div>
          <nav aria-label="App links" className="grid grid-cols-2 gap-x-10 gap-y-3 self-start text-[20px] font-semibold tracking-[-0.03em]">
            {APP_ROUTES.map((r) => (
              <a key={r.id} href={href(r.id)} className="min-h-11 rounded-lg py-2 hover:text-accent-deep">
                {r.label}
              </a>
            ))}
          </nav>
        </div>

        <div className="mt-10 select-none overflow-hidden" aria-hidden="true">
          <svg viewBox="0 0 1000 262" className="block w-full" role="presentation">
            <text x="0" y="252" fontSize="352" fontWeight="700" fontFamily="Switzer, sans-serif" letterSpacing="-20" textLength="1000" lengthAdjust="spacingAndGlyphs" fill="#fff">
              <tspan fill="#6e54ff">T</tspan>iffin Fi
            </text>
          </svg>
        </div>

        <p className="label mt-8 max-w-[640px] text-[13px] leading-relaxed text-ondeep">
          Tiffin Fi is hackathon software built at ETHGlobal Mumbai. The contracts are unaudited and the stock tokens are test tokens. Not investment advice, and not a registered fund or ETF. Nvidia, Apple, Microsoft, Uniswap, Chainlink and Arc are their owners' names.
        </p>
      </div>
    </footer>
  )
}
