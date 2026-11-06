import { useState, type ReactNode } from 'react'
import { ASSETS } from '../config'
import { PoolDiagram } from '../diagrams'
import { fmtBps, fmtSharePrice, fmtUsd } from '../format'
import { valueUsd } from '../math'
import { Chip, NumBadge, PENDING } from '../ui'
import { useFund, type FundData } from '../useFund'

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

function ReserveArt({ data }: { data: FundData | null }) {
  const values = data ? ASSETS.map((a) => Number(valueUsd(a.index, data.reserves[a.index], data.refPrices))) : [1, 1, 1, 1]
  const sum = values.reduce((s, v) => s + v, 0) || 1
  return (
    <svg viewBox="0 0 300 150" className="w-full max-w-[320px]" role="img" aria-label="Four reserve slices in the asset colours">
      <rect x="10" y="20" width="280" height="110" rx="16" fill="#0d0a1a" opacity="0.6" />
      {ASSETS.map((a, i) => {
        const widths = values.map((v) => Math.max(24, (v / sum) * 252))
        const x = 24 + widths.slice(0, i).reduce((t, w) => t + w, 0)
        return <rect key={a.key} x={x} y={36} width={widths[i] - 4} height={78} rx="10" fill={a.key === 'USDC' ? '#ffffff' : a.color} />
      })}
    </svg>
  )
}

function ClockArt() {
  return (
    <svg viewBox="0 0 300 150" className="w-full max-w-[320px]" role="img" aria-label="A clock">
      <circle cx="150" cy="75" r="56" fill="#0d0a1a" opacity="0.6" stroke="#9583ff" strokeWidth="3" />
      <path d="M150 38v37l26 16" stroke="#fff" strokeWidth="5" strokeLinecap="round" fill="none" />
      {[0, 90, 180, 270].map((a) => (
        <line key={a} x1="150" y1="25" x2="150" y2="32" stroke="#9583ff" strokeWidth="3" transform={`rotate(${a} 150 75)`} />
      ))}
      <circle cx="150" cy="75" r="5" fill="#6e54ff" />
    </svg>
  )
}

function TokenArt() {
  return (
    <svg viewBox="0 0 300 150" className="w-full max-w-[320px]" role="img" aria-label="A BSKT token split into four slices">
      <circle cx="150" cy="75" r="58" fill="#0d0a1a" opacity="0.6" />
      <path d="M150 75V25a50 50 0 0 1 50 50z" fill="#6e54ff" />
      <path d="M150 75h50a50 50 0 0 1-50 50z" fill="#7de3fa" />
      <path d="M150 75v50a50 50 0 0 1-50-50z" fill="#ff8be0" />
      <path d="M150 75H100a50 50 0 0 1 50-50z" fill="#ffffff" />
      <circle cx="150" cy="75" r="14" fill="#1b1630" />
    </svg>
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
            style={{ background: 'linear-gradient(165deg, rgba(110,84,255,0.28) 0%, #1b1630 48%, #1b1630 100%)' }}
            aria-live="polite"
          >
            <div className="flex flex-1 items-center justify-center">
              {open === 0 && <PoolDiagram dark />}
              {open === 1 && <ReserveArt data={data} />}
              {open === 2 && <ClockArt />}
              {open === 3 && <TokenArt />}
            </div>
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
