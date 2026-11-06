import { LogoMark, Wordmark } from '../ui'
import { href } from '../route'
import { NOTICE } from '../Shell'
import { Accordion, BuiltWith, Compare, FooterBlock, LiveFund, Steps } from './LandingParts'

export function scrollToId(id: string) {
  const el = document.getElementById(id)
  if (!el) return
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' })
}

const NAV = [
  { id: 'how-it-works', label: 'How it works' },
  { id: 'parts', label: 'Four parts' },
  { id: 'why-it-pays', label: 'Why it pays' },
  { id: 'live', label: 'Live fund' },
]

function OpenApp({ size = 'md' }: { size?: 'md' | 'lg' }) {
  return (
    <a
      href={href('fund')}
      className={`inline-flex items-center gap-3 rounded-full bg-accent font-medium text-white shadow-[0_12px_28px_-10px_rgba(110,84,255,0.75)] transition hover:bg-accent-dark active:scale-[0.985] ${size === 'lg' ? 'min-h-14 py-2 pl-6 pr-2 text-[17px]' : 'min-h-12 py-1.5 pl-5 pr-1.5 text-[15px]'}`}
    >
      Open app
      <span className={`grid place-items-center rounded-full bg-white text-accent ${size === 'lg' ? 'size-10' : 'size-9'}`} aria-hidden="true">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M3.5 10.5l7-7M4.5 3.5h6v6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    </a>
  )
}

function Chip({ children }: { children: string }) {
  return (
    <span className="label inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-[13px] font-medium">
      <span aria-hidden="true">•</span>
      {children}
      <span aria-hidden="true">•</span>
    </span>
  )
}

function InlinePill() {
  return (
    <span className="mx-[0.06em] inline-flex h-[0.62em] w-[1.62em] translate-y-[0.02em] items-center gap-[0.07em] rounded-full bg-ink px-[0.05em] align-middle" aria-hidden="true">
      <span className="grid size-[0.5em] shrink-0 place-items-center rounded-full bg-accent">
        <LogoMark size="68%" color="#fff" />
      </span>
      <span className="size-[0.1em] rounded-full bg-[#8B77FF]" />
      <span className="size-[0.1em] rounded-full bg-cyan" />
      <span className="size-[0.1em] rounded-full bg-pink" />
      <span className="size-[0.1em] rounded-full bg-white" />
    </span>
  )
}

function Hl({ children, tone }: { children: string; tone: 'white' | 'pink' | 'lav' | 'ink' }) {
  const t = { white: 'bg-white text-ink', pink: 'bg-pink text-ink', lav: 'bg-lav text-accent-dark', ink: 'bg-ink text-white' }[tone]
  return <span className={`mx-0.5 inline rounded-lg px-2 py-0.5 [box-decoration-break:clone] ${t}`}>{children}</span>
}

export function Landing() {
  return (
    <div className="bg-white">
      <div className="mx-auto max-w-[1440px] px-3 sm:px-4">
        <p className="label mt-3 rounded-full bg-lav px-4 py-2.5 text-center text-[12px] leading-snug text-[#2c2250] sm:text-[13px]">{NOTICE}</p>

        <header className="flex items-center justify-between gap-3 py-3 sm:py-4">
          <a href={href('landing')} aria-label="Tiffin Fi home" className="rounded-xl">
            <Wordmark />
          </a>
          <nav aria-label="Sections" className="hidden items-center gap-1 md:flex">
            {NAV.map((n) => (
              <button
                key={n.id}
                onClick={() => scrollToId(n.id)}
                className="label min-h-11 rounded-full px-4 text-[15px] text-[#2a2640] transition hover:bg-[#F2F1F6]"
              >
                {n.label}
              </button>
            ))}
          </nav>
          <OpenApp />
        </header>

        <section className="rounded-[28px] bg-card px-4 pb-14 pt-12 sm:rounded-[32px] sm:px-8 sm:pb-20 sm:pt-16">
          <div className="mx-auto flex max-w-[1100px] flex-col items-center text-center">
            <div className="flex flex-wrap justify-center gap-2">
              <Chip>Built on Arc</Chip>
              <Chip>A Uniswap v4 hook</Chip>
            </div>
            <h1 className="mt-8 text-[clamp(42px,9.6vw,118px)] font-bold leading-[0.98] tracking-[-0.05em] text-ink">
              What if your index fund <InlinePill /> paid you instead of charging you?
            </h1>
            <p className="label mt-8 max-w-[760px] text-[17px] leading-[2.05] text-[#6b6878] sm:text-[20px]">
              The basket keeps <Hl tone="white">Nvidia, Apple, Microsoft</Hl> and <Hl tone="pink">USDC</Hl> in one token. Traders pay <Hl tone="lav">its fees</Hl>, and a Chainlink clock makes <Hl tone="ink">Monday's gap pay the fund.</Hl>
            </p>
            <div className="mt-9 flex flex-wrap justify-center gap-3">
              <OpenApp size="lg" />
              <button
                onClick={() => scrollToId('why-it-pays')}
                className="inline-flex min-h-14 items-center rounded-full border border-[#c9c7d3] px-7 text-[17px] font-medium transition hover:bg-white active:scale-[0.985]"
              >
                See the Monday gap
              </button>
            </div>
          </div>
        </section>

        <Accordion />
        <Compare />
        <LiveFund />
        <Steps />
        <BuiltWith />
        <FooterBlock />
      </div>
    </div>
  )
}

