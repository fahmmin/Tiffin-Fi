import { useState } from 'react'
import { Chip, Pill } from '../ui'

type PartId = 'wall' | 'cre' | 'clock' | 'trader' | 'pools' | 'hook' | 'reserve' | 'holders' | 'arc'

interface Step {
  title: string
  partner: string
  lit: PartId[]
  body: string
}

const STEPS: Step[] = [
  {
    title: 'Chainlink checks Wall Street',
    partner: 'Chainlink CRE',
    lit: ['wall', 'cre'],
    body: 'Every five minutes a CRE workflow runs on many Chainlink nodes. Each fetches Nvidia, Apple and Microsoft; they agree on the median, work out NYSE hours and sign one report to MarketClock on Arc.',
  },
  {
    title: 'A trader swaps',
    partner: 'Uniswap v4',
    lit: ['trader', 'pools'],
    body: 'A bot sends USDC to the Nvidia/USDC pool. It is one of six v4 pools, one per pair of the four assets, and all six point at the same hook.',
  },
  {
    title: 'The hook prices it',
    partner: 'Uniswap v4',
    lit: ['hook'],
    body: "In beforeSwap the hook prices the trade with Balancer's weighted maths over the shared reserve. The pool still says Friday's $188 for Nvidia.",
  },
  {
    title: 'The hook checks the clock',
    partner: 'Chainlink CRE',
    lit: ['clock', 'hook'],
    body: 'MarketClock says Wall Street is open and Nvidia is $197, so the bot is getting a $9-a-share bargain. 80% of that beats the 0.30% fee, so the gap fee applies.',
  },
  {
    title: 'Arc settles it',
    partner: 'Arc',
    lit: ['arc'],
    body: "The hook returns a BeforeSwapDelta, so Uniswap's own curve swaps nothing. Arc settles the trade in USDC, final in under a second.",
  },
  {
    title: 'The fund keeps the fee',
    partner: 'The fund',
    lit: ['reserve', 'holders'],
    body: 'The fee stays in the shared reserve, held as ERC-6909 claims. Same number of BSKT, a bigger reserve, so every share redeems for more.',
  },
]

const FLOW: { id: PartId; name: string; sub: string; color: string }[] = [
  { id: 'wall', name: 'Wall Street', sub: 'NVDA, AAPL, MSFT', color: '#b9b2db' },
  { id: 'cre', name: 'Chainlink CRE', sub: 'nodes fetch prices, median + NYSE hours', color: '#4f6df5' },
  { id: 'clock', name: 'MarketClock', sub: 'a price per stock, market open or closed', color: '#4f6df5' },
  { id: 'trader', name: 'Trader', sub: 'swaps USDC for NVDA', color: '#ffffff' },
  { id: 'pools', name: '6 Uniswap v4 pools', sub: 'one per pair of NVDA, AAPL, MSFT, USDC', color: '#b44fe0' },
  { id: 'hook', name: 'BasketHook', sub: 'beforeSwap with Balancer maths, returns a BeforeSwapDelta', color: '#b44fe0' },
  { id: 'reserve', name: 'Shared reserve', sub: 'ERC-6909 claims, 25% each of 4 assets', color: '#1fb980' },
  { id: 'holders', name: 'Holders', sub: 'get BSKT, a share of the reserve; fees stay inside', color: '#1fb980' },
]

const BLUE = '#5b7bff'
const PURPLE = '#b44fe0'
const GREEN = '#1fb980'

function Arrow({ d, label, lx, ly, op }: { d: string; label: string; lx: number; ly: number; op: number }) {
  return (
    <g opacity={op}>
      <path d={d} stroke="#c9c6e6" strokeWidth="2" fill="none" markerEnd="url(#ah-arrow)" />
      <text x={lx} y={ly} fill="#fff" fontSize="12" fontWeight="600" textAnchor="middle" fontFamily="Geist, sans-serif">
        {label}
      </text>
    </g>
  )
}

function Box({ x, y, w, h, stroke, lines, op, fill = '#06040f' }: { x: number; y: number; w: number; h: number; stroke: string; lines: string[]; op: number; fill?: string }) {
  return (
    <g opacity={op}>
      <rect x={x} y={y} width={w} height={h} fill={fill} stroke={stroke} strokeWidth="2.5" />
      {lines.map((t, i) => (
        <text key={t} x={x + w / 2} y={y + h / 2 + (i - (lines.length - 1) / 2) * 17 + 4} fill="#fff" fontSize="12" fontWeight={i === 0 ? 700 : 500} textAnchor="middle" fontFamily="Geist, sans-serif">
          {t}
        </text>
      ))}
    </g>
  )
}

function Badge({ n, x, y, op }: { n: number; x: number; y: number; op: number }) {
  return (
    <g opacity={op}>
      <circle cx={x} cy={y} r="18" fill="#2a1608" stroke="#f07a22" strokeWidth="3" />
      <text x={x} y={y + 5} fill="#fff" fontSize="14" fontWeight="700" textAnchor="middle" fontFamily="Geist, sans-serif">
        {n}
      </text>
    </g>
  )
}

function Diagram({ step }: { step: number }) {
  const lit = new Set<PartId>(step === 0 ? (['wall', 'cre', 'clock', 'trader', 'pools', 'hook', 'reserve', 'holders', 'arc'] as PartId[]) : STEPS[step - 1].lit)
  const o = (...ids: PartId[]) => (step === 0 || ids.some((i) => lit.has(i)) ? 1 : 0.22)
  return (
    <svg
      viewBox="0 0 900 610"
      className="w-full"
      role="img"
      aria-label="System diagram: Wall Street quotes go to Chainlink CRE, which signs a report to MarketClock on Arc. A trader swaps into six Uniswap v4 pools, which call BasketHook's beforeSwap. The hook asks MarketClock for the price and whether the market is open, then takes in and pays out against the shared reserve. Holders hold BSKT, a claim on the reserve."
    >
      <defs>
        <marker id="ah-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
          <path d="M0 0L10 5L0 10z" fill="#c9c6e6" />
        </marker>
      </defs>

      <g opacity={step === 0 || lit.has('arc') ? 1 : 0.35}>
        <rect x="262" y="150" width="626" height="448" fill="none" stroke={lit.has('arc') && step === 5 ? '#9583ff' : '#a8a5c9'} strokeWidth="2" strokeDasharray="7 6" />
        <text x="278" y="172" fill="#c9c6e6" fontSize="11" fontFamily="Geist, sans-serif">
          Arc testnet: gas in USDC, final in under a second
        </text>
      </g>

      <g opacity={o('wall')}>
        <ellipse cx="100" cy="78" rx="84" ry="44" fill="#06040f" stroke="#c9c6e6" strokeWidth="2.5" />
        <text x="100" y="74" textAnchor="middle" fill="#fff" fontSize="12" fontWeight="700" fontFamily="Geist, sans-serif">Wall Street</text>
        <text x="100" y="92" textAnchor="middle" fill="#fff" fontSize="12" fontFamily="Geist, sans-serif">NVDA  AAPL  MSFT</text>
      </g>
      <g opacity={o('trader')}>
        <ellipse cx="100" cy="408" rx="84" ry="62" fill="#06040f" stroke="#fff" strokeWidth="2.5" />
        {['Trader', 'swaps USDC', 'for NVDA'].map((t, i) => (
          <text key={t} x="100" y={394 + i * 17} textAnchor="middle" fill="#fff" fontSize="12" fontWeight={i === 0 ? 700 : 500} fontFamily="Geist, sans-serif">{t}</text>
        ))}
      </g>

      <Box op={o('cre')} x={285} y={35} w={235} h={88} stroke={BLUE} lines={['Chainlink CRE', 'nodes fetch prices,', 'median + NYSE hours']} />
      <Box op={o('clock')} x={620} y={205} w={235} h={88} stroke={BLUE} lines={['MarketClock', 'price per stock,', 'market open or closed']} fill="#141b3d" />
      <Box op={o('pools')} x={285} y={345} w={235} h={120} stroke={PURPLE} lines={['6 Uniswap v4 pools', 'one per pair of', 'NVDA AAPL MSFT USDC']} />
      <Box op={o('hook')} x={620} y={345} w={235} h={120} stroke={PURPLE} lines={['BasketHook', 'beforeSwap: Balancer maths', 'fee: 0.30% or 80% of edge', 'returns BeforeSwapDelta']} fill="#2a1d3a" />
      <Box op={o('holders')} x={285} y={505} w={235} h={85} stroke={GREEN} lines={['Holders get BSKT', 'a share of the reserve,', 'fees stay inside']} />
      <Box op={o('reserve')} x={620} y={505} w={235} h={85} stroke={GREEN} lines={['Shared reserve', 'ERC-6909 claims', '25% each of 4 assets']} />

      <Arrow d="M186 78H283" label="quotes" lx={235} ly={68} op={o('wall', 'cre')} />
      <Arrow d="M440 123L690 203" label="signed report" lx={520} ly={160} op={o('cre')} />
      <Arrow d="M186 405H283" label="swap" lx={235} ly={395} op={o('trader', 'pools')} />
      <Arrow d="M520 405H618" label="beforeSwap" lx={569} ly={395} op={o('pools', 'hook')} />
      <Arrow d="M737 293V343" label="price + open?" lx={737} ly={318} op={o('clock', 'hook')} />
      <Arrow d="M737 465V503" label="takes in, pays out" lx={737} ly={488} op={o('hook', 'reserve')} />
      <Arrow d="M520 548H618" label="claim on" lx={569} ly={538} op={o('holders', 'reserve')} />

      <Badge n={1} x={285} y={35} op={o('cre')} />
      <Badge n={2} x={190} y={350} op={o('trader')} />
      <Badge n={3} x={620} y={345} op={o('hook')} />
      <Badge n={4} x={620} y={205} op={o('clock')} />
      <Badge n={5} x={285} y={345} op={o('arc')} />
      <Badge n={6} x={620} y={505} op={o('reserve')} />
    </svg>
  )
}

function Iso() {
  const tile = (cx: number, cy: number, key: string, strong = false) => (
    <path key={key} d={`M${cx} ${cy - 14}l26 12-26 12-26-12z`} fill={strong ? '#1b1630' : 'none'} stroke="#8c86b8" strokeWidth="1.5" />
  )
  const pts: [number, number][] = [[90, 45], [60, 62], [120, 62], [90, 79], [150, 79], [30, 79], [120, 96], [60, 96], [90, 113]]
  return (
    <svg viewBox="0 0 180 150" className="mx-auto h-28 w-auto" aria-hidden="true">
      {pts.map(([x, y], i) => tile(x, y, String(i), i === 3))}
    </svg>
  )
}

export function Walkthrough() {
  const [step, setStep] = useState(0)
  const current = step > 0 ? STEPS[step - 1] : null

  return (
    <section id="architecture" className="on-dark relative scroll-mt-20 overflow-hidden rounded-[32px] bg-deep px-4 py-14 text-white sm:px-10 sm:py-20" aria-labelledby="walk-title">
      <div className="grid-lines pointer-events-none absolute inset-0" aria-hidden="true" />
      <div className="relative mx-auto max-w-[1100px]">
        <Chip dark>Under the hood</Chip>
        <h2 id="walk-title" className="mt-5 max-w-[620px] text-[clamp(2.2rem,4.8vw,3.6rem)] font-semibold leading-none tracking-[-0.04em]">
          One swap, start to finish.
        </h2>
        <p className="label mt-5 max-w-[640px] text-[16px] leading-relaxed text-ondeep">
          Monday, 9:30 in New York. The pool still shows Friday's price for Nvidia. Walk the trade through every part.
        </p>

        <div className="mt-10 grid gap-4 lg:grid-cols-[1fr_340px]">
          <div className="rounded-3xl border border-white/10 bg-[#0f0b20] p-3 sm:p-5">
            <div className="hidden sm:block">
              <Diagram step={step} />
            </div>
            <ol className="space-y-2 sm:hidden" aria-label="The parts of the system">
              {FLOW.map((f) => {
                const on = step === 0 || (current?.lit.includes(f.id) ?? false)
                return (
                  <li key={f.id} className={`rounded-xl border-l-4 bg-black/40 px-3 py-2.5 transition-opacity ${on ? 'opacity-100' : 'opacity-30'}`} style={{ borderColor: f.color }}>
                    <div className="label text-[14px] font-bold">{f.name}</div>
                    <div className="label text-[12px] text-ondeep">{f.sub}</div>
                  </li>
                )
              })}
            </ol>
          </div>

          <div className="flex flex-col rounded-3xl border border-white/10 bg-deep-2 p-6">
            <Iso />
            <div className="mt-5">
              <Chip dark>6 steps</Chip>
            </div>
            <h3 className="mt-3 text-[28px] font-semibold leading-tight tracking-[-0.04em]">{current ? current.title : 'Follow one Monday trade'}</h3>
            <div aria-live="polite" className="mt-3 min-h-[132px]">
              {current ? (
                <>
                  <Pill tone="lav" className="mb-2">
                    Step {step} of 6 · {current.partner}
                  </Pill>
                  <p className="label text-[15px] leading-relaxed text-ondeep">{current.body}</p>
                </>
              ) : (
                <p className="label text-[15px] leading-relaxed text-ondeep">
                  Press Start, and each step lights up the parts it uses: Chainlink CRE, Uniswap v4, Arc and the fund.
                </p>
              )}
            </div>
            <div className="mt-6 flex items-center gap-3">
              <button
                onClick={() => setStep((s) => Math.max(0, s - 1))}
                disabled={step === 0}
                className="label min-h-11 rounded-full border border-white/15 px-5 text-[14px] font-semibold text-ondeep transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Back
              </button>
              <div className="flex flex-1 justify-center gap-1.5" aria-hidden="true">
                {STEPS.map((_, i) => (
                  <span key={i} className={`size-2.5 rounded-full ${step === i + 1 ? 'bg-accent' : step > i + 1 ? 'bg-accent-deep' : 'bg-white/20'}`} />
                ))}
              </div>
              <button
                onClick={() => setStep((s) => (s >= 6 ? 0 : s + 1))}
                className="label min-h-11 rounded-full bg-accent px-6 text-[14px] font-semibold text-white transition hover:bg-accent-dark"
              >
                {step === 0 ? 'Start' : step >= 6 ? 'Restart' : 'Next'}
              </button>
            </div>
          </div>
        </div>
        <p className="label mt-4 text-[13px] text-ondeep">Drawn for this page. The numbers match the steps.</p>
      </div>
    </section>
  )
}
