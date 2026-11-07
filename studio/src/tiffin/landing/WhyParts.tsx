import { useState, type CSSProperties, type ReactNode } from 'react'
import { Basket, Relay, Vault } from '@lucasmarkes/hairline/react'
import { PoolDiagram } from '../diagrams'
import { fmtBps, fmtSharePrice, fmtUsd } from '../format'
import { Chip, NumBadge, PENDING } from '../ui'
import { useFund } from '../useFund'

interface Part {
  n: string
  name: string
  body: string
}

const PARTS: Part[] = [
  {
    n: '01',
    name: 'The hook',
    body: "A custom curve in beforeSwap. Uniswap v4's own maths swaps nothing; the hook prices every trade with Balancer's weighted formula.",
  },
  {
    n: '02',
    name: 'The shared reserve',
    body: "The fund's balances, held as ERC-6909 claims in the v4 PoolManager. Every pair of the four assets is a pool, and all six trade against this one reserve.",
  },
  {
    n: '03',
    name: 'The market clock',
    body: "A Chainlink CRE workflow writes Wall Street's prices and hours into a clock contract on Arc. The hook reads it on every swap to set the fee and measure the edge.",
  },
  {
    n: '04',
    name: 'The fund token',
    body: 'BSKT is your share of the reserve. Buy it with USDC and sell it for USDC. Fees stay in the reserve, so each share redeems for more.',
  },
]

const PARTS_VARS = {
  '--hairline-plate': '#211a47',
  '--hairline-hi': '#ffffff',
  '--hairline-edge': '#c9c2ec',
  '--hairline-mid': '#5a4f8f',
  '--hairline-lo': '#2a2160',
  '--hairline-stroke': '1',
} as CSSProperties

/** The shared reserve, the market clock and the fund token each show one line figure. */
const PART_FIGURES = [null, Vault, Relay, Basket] as const

function PartFigure({ index, name }: { index: number; name: string }) {
  const Fig = PART_FIGURES[index]
  if (!Fig) return null
  return (
    <div className="mx-auto aspect-[5/4] w-full max-w-[260px]">
      <Fig play intensity={0.6} theme="dark" label={`Animated figure for: ${name}`} />
    </div>
  )
}

function Stat({ big, caption }: { big: ReactNode; caption: string }) {
  return (
    <>
      <div className="display num text-[clamp(2.4rem,5.6vw,4.6rem)] leading-none tracking-[-0.04em]">{big}</div>
      <p className="label mt-2 text-[15px] text-ondeep">{caption}</p>
    </>
  )
}

export function WhyParts() {
  const { data } = useFund()
  const [open, setOpen] = useState(0)
  const part = PARTS[open]
  const market = data ? (data.marketOpen ? 'open' : 'closed') : null

  return (
    <section id="why" className="on-dark relative overflow-hidden rounded-[32px] bg-deep px-4 py-14 text-white sm:px-10 sm:py-20" aria-labelledby="why-title">
      <div className="grid-lines pointer-events-none absolute inset-0" aria-hidden="true" />
      <div className="relative mx-auto max-w-[1100px]">
        <Chip dark>Why this exists</Chip>
        <p id="why-title" className="display mt-6 max-w-[900px] text-[clamp(2.1rem,3.8vw,3.3rem)] font-semibold leading-[1.08] tracking-[-0.04em]">
          Tokenized stocks trade all weekend while Wall Street is shut. On Monday the first bot to close the gap takes <span className="text-accent-deep">what the pool's holders lost.</span>
        </p>

        <div className="mt-16 grid gap-8 lg:grid-cols-[1fr_1fr] lg:gap-14">
          <div>
            <Chip dark>Four parts, one fund</Chip>
            <h2 className="mt-5 max-w-[420px] text-[clamp(2.2rem,4.8vw,3.6rem)] font-semibold leading-none tracking-[-0.04em]">What makes the fund pay you?</h2>
            <ul className="mt-8 border-t border-white/15">
              {PARTS.map((p, i) => {
                const isOpen = open === i
                return (
                  <li key={p.n} className="border-b border-white/15">
                    <h3 className="!tracking-normal">
                      <button
                        onClick={() => setOpen(i)}
                        aria-expanded={isOpen}
                        aria-controls={`part-${i}`}
                        className="flex min-h-[64px] w-full items-center gap-4 py-4 text-left"
                      >
                        <NumBadge n={p.n} active={isOpen} dark />
                        <span className={`display text-[clamp(1.4rem,2vw,1.7rem)] tracking-[-0.035em] ${isOpen ? 'text-white' : 'text-ondeep'}`}>{p.name}</span>
                      </button>
                    </h3>
                    {isOpen && (
                      <div id={`part-${i}`} className="pb-6 pl-[52px] pr-2">
                        <p className="label max-w-[460px] text-[15px] leading-relaxed text-ondeep">{p.body}</p>
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          </div>

          <div
            className="flex min-h-[420px] flex-col rounded-3xl p-6 sm:p-8"
            style={{ ...PARTS_VARS, background: 'linear-gradient(165deg, #2a2160 0%, #1b1630 60%, #1b1630 100%)' }}
            aria-live="polite"
          >
            {open === 0 ? (
              <div className="flex flex-1 items-center justify-center">
                <PoolDiagram dark />
              </div>
            ) : (
              <div className="flex flex-1 items-start justify-center">
                <PartFigure index={open} name={part.name} />
              </div>
            )}
            <div className="mt-6">
              <div className="label text-[13px] font-semibold text-accent-deep">{part.name}</div>
              <div className="mt-3">
                {open === 0 && <Stat big="1" caption="hook prices all six pools" />}
                {open === 1 && <Stat big={data ? fmtUsd(data.nav) : PENDING} caption="in the reserve right now, at Chainlink's prices" />}
                {open === 2 && <Stat big={data ? fmtBps(data.postedBps) : PENDING} caption={`posted fee right now, with Wall Street ${market ?? PENDING}`} />}
                {open === 3 && <Stat big={data ? fmtSharePrice(data.sharePrice) : PENDING} caption="for one BSKT right now" />}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
