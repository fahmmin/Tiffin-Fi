import { href } from '../route'
import { Chip, CtaLink, LogoMark } from '../ui'

function InlinePill() {
  return (
    <span
      className="mx-[0.05em] inline-flex h-[0.66em] w-[1.85em] translate-y-[0.03em] items-center gap-[0.09em] rounded-full bg-[#0b0818] pl-[0.03em] pr-[0.14em] align-middle"
      aria-hidden="true"
    >
      <span className="grid size-[0.6em] shrink-0 place-items-center rounded-full bg-accent ring-[0.03em] ring-[#3a2f8f]">
        <LogoMark size="66%" color="#fff" />
      </span>
      <span className="ml-[0.08em] size-[0.12em] rounded-full bg-accent" />
      <span className="size-[0.12em] rounded-full bg-cyan" />
      <span className="size-[0.12em] rounded-full bg-pink" />
      <span className="size-[0.12em] rounded-full bg-white" />
    </span>
  )
}

function Tag({ tone, children }: { tone: 'white' | 'pink' | 'lav' | 'ink'; children: string }) {
  const t = { white: 'bg-white text-ink', pink: 'bg-pink text-ink', lav: 'bg-lav-2 text-ink', ink: 'bg-ink font-semibold text-white' }[tone]
  return <span className={`mx-0.5 inline rounded-lg px-2 py-[3px] [box-decoration-break:clone] ${t}`}>{children}</span>
}

export function Hero() {
  return (
    <section className="rounded-[32px] bg-card px-4 pb-14 pt-14 sm:px-8 sm:pb-20 sm:pt-16" aria-labelledby="hero-title">
      <div className="mx-auto flex max-w-[1100px] flex-col items-center text-center">
        <div className="flex flex-wrap justify-center gap-2">
          <Chip className="!bg-white">Built on Arc</Chip>
          <Chip className="!bg-white">A Uniswap v4 hook</Chip>
        </div>
        <h1 id="hero-title" className="mt-9 text-[clamp(2.5rem,7.2vw,6.2rem)] font-bold leading-[0.95] tracking-[-0.05em] text-ink">
          What if your index fund <InlinePill /> paid you instead of charging you?
        </h1>
        <p className="label mt-8 max-w-[760px] text-[17px] leading-[2] text-ink-2 sm:text-[19px]">
          The basket keeps <Tag tone="white">Nvidia, Apple, Microsoft</Tag> and <Tag tone="pink">USDC</Tag> in one token. Traders pay <Tag tone="lav">its fees</Tag>, and a Chainlink clock makes <Tag tone="ink">Monday's gap pay the fund.</Tag>
        </p>
        <div className="mt-9 flex flex-wrap justify-center gap-3">
          <CtaLink href={href('fund')} size="lg">
            Open app
          </CtaLink>
          <CtaLink href="#compare" variant="outline" size="lg">
            See the Monday gap
          </CtaLink>
        </div>
      </div>
    </section>
  )
}
