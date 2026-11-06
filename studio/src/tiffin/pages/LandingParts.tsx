import { useState, type ReactNode } from 'react'
import { Check, Plus, X } from 'lucide-react'
import { fmtBps, fmtSharePrice, fmtUsd, fmtPct } from '../format'
import { href } from '../route'
import { Pill, Dot, Skeleton } from '../ui'
import { useFund } from '../useFund'

/* ---------- Four parts, one fund ---------- */

const PARTS = [
  {
    n: '01',
    title: 'The hook',
    body: 'One Uniswap v4 hook serves all six pools. It takes the trader’s input, pays the output from the fund, and keeps the fee in the reserve.',
  },
  {
    n: '02',
    title: 'The shared reserve',
    body: 'Nvidia, Apple, Microsoft and USDC sit in one reserve. Every pair, from NVDA to USDC to AAPL to MSFT, trades against the same four balances.',
  },
  {
    n: '03',
    title: 'The market clock',
    body: 'A Chainlink CRE workflow reports Wall Street’s prices and whether the market is open. When prices jump at the open, the clock lets the fund charge for it.',
  },
  {
    n: '04',
    title: 'The fund token',
    body: 'BSKT is one share of the whole basket. As traders pay fees into the reserve, each share redeems for more.',
  },
]

function HookVisual() {
  const pts = [
    { x: 60, y: 60, l: 'NVDA' },
    { x: 240, y: 60, l: 'AAPL' },
    { x: 60, y: 220, l: 'MSFT' },
    { x: 240, y: 220, l: 'USDC' },
  ]
  const edges: [number, number][] = [[0, 1], [0, 2], [0, 3], [1, 2], [1, 3], [2, 3]]
  return (
    <svg viewBox="0 0 300 280" className="w-full max-w-[340px]" role="img" aria-label="Four assets connected by six pools through one hook">
      {edges.map(([a, b], i) => (
        <line key={i} x1={pts[a].x} y1={pts[a].y} x2={pts[b].x} y2={pts[b].y} stroke="#6E54FF" strokeWidth="2" strokeOpacity="0.55" />
      ))}
      <circle cx="150" cy="140" r="30" fill="#6E54FF" />
      <text x="150" y="145" textAnchor="middle" fill="#fff" fontSize="13" fontWeight="600">hook</text>
      {pts.map((p) => (
        <g key={p.l}>
          <circle cx={p.x} cy={p.y} r="28" fill="#fff" />
          <text x={p.x} y={p.y + 4} textAnchor="middle" fill="#0D0A1A" fontSize="12" fontWeight="600">{p.l}</text>
        </g>
      ))}
    </svg>
  )
}

function ReserveVisual() {
  const { data } = useFund()
  const rows = [
    ['Nvidia', '#6E54FF'],
    ['Apple', '#7DE3FA'],
    ['Microsoft', '#FF8BE0'],
    ['USDC', '#ffffff'],
  ]
  return (
    <div className="w-full max-w-[340px] space-y-3">
      {rows.map(([n, c]) => (
        <div key={n}>
          <div className="label mb-1 flex justify-between text-[12px] text-white/70">
            <span>{n}</span>
            <span>a quarter</span>
          </div>
          <div className="h-3 overflow-hidden rounded-full bg-white/10">
            <div className="h-full w-1/4 rounded-full" style={{ background: c }} />
          </div>
        </div>
      ))}
      <p className="label pt-2 text-[12px] text-white/60">{data ? `Fund value now ${fmtUsd(data.nav)}` : 'Reading the fund…'}</p>
    </div>
  )
}

function ClockVisual() {
  const { data } = useFund()
  return (
    <div className="w-full max-w-[340px] space-y-3">
      <div className="rounded-2xl bg-white/10 p-4">
        <div className="label text-[12px] text-white/60">Wall Street</div>
        <div className="display mt-1 text-[28px]">{data ? (data.marketOpen ? 'Open' : 'Closed') : '…'}</div>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {[
          ['Open', data?.openBps],
          ['Closed', data?.closedBps],
          ['Stale', data?.staleBps],
        ].map(([l, b]) => (
          <div key={l as string} className="rounded-2xl bg-white/10 p-3">
            <div className="label text-[11px] text-white/60">{l}</div>
            <div className="display num text-[20px]">{b !== undefined ? fmtBps(b as number) : '—'}</div>
          </div>
        ))}
      </div>
      <p className="label text-[12px] text-white/60">Posted fee per swap. The gap fee can be bigger.</p>
    </div>
  )
}

function TokenVisual() {
  const { data } = useFund()
  return (
    <div className="w-full max-w-[340px] rounded-3xl bg-white p-6 text-ink">
      <div className="label text-[13px] text-[#6b6878]">One BSKT share is worth</div>
      <div className="display num mt-1 text-[48px] leading-none text-accent">{data ? fmtSharePrice(data.sharePrice) : <Skeleton className="w-32">0000</Skeleton>}</div>
      <div className="label mt-4 text-[13px] text-[#55526a]">Fees stay in the reserve, so this number only has reasons to go up.</div>
    </div>
  )
}

export function Accordion() {
  const [open, setOpen] = useState(0)
  const visuals = [<HookVisual key="h" />, <ReserveVisual key="r" />, <ClockVisual key="c" />, <TokenVisual key="t" />]
  return (
    <section id="parts" className="on-dark relative mt-4 scroll-mt-4 overflow-hidden rounded-[28px] bg-ink px-4 py-12 text-white sm:rounded-[32px] sm:px-10 sm:py-16">
      <div className="grid-lines pointer-events-none absolute inset-0" aria-hidden="true" />
      <div className="relative mx-auto max-w-[1100px]">
        <h2 className="text-[clamp(34px,6vw,64px)] leading-[1.02]">Four parts, one fund</h2>
        <div className="mt-8 grid gap-6 lg:grid-cols-[1.1fr_1fr] lg:gap-10">
          <ul className="divide-y divide-white/15 border-y border-white/15">
            {PARTS.map((p, i) => {
              const isOpen = open === i
              return (
                <li key={p.n}>
                  <h3 className="!tracking-normal">
                    <button
                      onClick={() => setOpen(i)}
                      aria-expanded={isOpen}
                      aria-controls={`part-${i}`}
                      className="flex min-h-16 w-full items-center gap-4 py-4 text-left"
                    >
                      <span className="label num w-8 text-[14px] text-white/50">{p.n}</span>
                      <span className="display flex-1 text-[22px] tracking-[-0.04em] sm:text-[26px]">{p.title}</span>
                      <Plus className={`size-5 shrink-0 transition-transform ${isOpen ? 'rotate-45' : ''}`} aria-hidden="true" />
                    </button>
                  </h3>
                  {isOpen && (
                    <div id={`part-${i}`} className="pb-5 pl-12 pr-2">
                      <p className="label text-[15px] leading-relaxed text-white/75 sm:text-[16px]">{p.body}</p>
                      <div className="mt-5 flex justify-center rounded-3xl bg-[#1a1530] p-5 lg:hidden">{visuals[i]}</div>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
          <div className="hidden min-h-[360px] items-center justify-center rounded-3xl border border-white/10 bg-[#1a1530] p-8 lg:flex" aria-live="polite">
            {visuals[open]}
          </div>
        </div>
      </div>
    </section>
  )
}

/* ---------- Comparison ---------- */

function List({ items, good }: { items: string[]; good: boolean }) {
  return (
    <ul className="space-y-3">
      {items.map((t) => (
        <li key={t} className="label flex items-start gap-3 text-[15px] leading-snug">
          <span className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-full ${good ? 'bg-accent text-white' : 'bg-[#e4e2ea] text-[#6b6878]'}`}>
            {good ? <Check className="size-3" strokeWidth={3} aria-hidden="true" /> : <X className="size-3" strokeWidth={3} aria-hidden="true" />}
          </span>
          <span className="sr-only">{good ? 'Yes: ' : 'No: '}</span>
          {t}
        </li>
      ))}
    </ul>
  )
}

function Bar({ label, value, pct, tone }: { label: string; value: string; pct: number; tone: 'dark' | 'accent' | 'grey' }) {
  const bg = { dark: 'bg-ink', accent: 'bg-accent', grey: 'bg-[#cfcdd8]' }[tone]
  return (
    <div>
      <div className="label flex justify-between text-[13px]">
        <span className="text-[#55526a]">{label}</span>
        <span className="num font-semibold">{value}</span>
      </div>
      <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-[#ECEBF1]">
        <div className={`h-full rounded-full ${bg}`} style={{ width: `${Math.max(2, Math.min(100, pct))}%` }} />
      </div>
    </div>
  )
}

export function Compare() {
  const { data } = useFund()
  const fundShare = data ? 100 - data.protocolShareBps / 100 : 90
  return (
    <section id="why-it-pays" className="mt-4 scroll-mt-4 rounded-[28px] bg-card px-4 py-12 sm:rounded-[32px] sm:px-10 sm:py-16">
      <div className="mx-auto max-w-[1100px]">
        <h2 className="max-w-3xl text-[clamp(32px,5.6vw,60px)] leading-[1.02]">A plain fund against one that gets paid</h2>
        <div className="mt-8 grid gap-4 md:grid-cols-2">
          <div className="rounded-3xl bg-white p-6">
            <Pill>A plain index fund</Pill>
            <div className="mt-5">
              <List
                good={false}
                items={[
                  'You pay a yearly fee for it to exist',
                  'Rebalancing trades give the opening gap to whoever trades first',
                  'The market clock is somebody else’s problem',
                  'Your shares track the index and nothing more',
                ]}
              />
            </div>
          </div>
          <div className="rounded-3xl bg-white p-6 ring-2 ring-accent">
            <Pill tone="lav">Tiffin Fi</Pill>
            <div className="mt-5">
              <List
                good
                items={[
                  'Traders pay the fund every time they swap against it',
                  'A bot that trades the Monday gap pays 80% of its edge back',
                  'Chainlink CRE tells the hook the time and the price',
                  'Fees stay in the reserve, so each share redeems for more',
                ]}
              />
            </div>
          </div>
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div className="rounded-3xl bg-white p-6">
            <div className="label text-[13px] text-[#6b6878]">Illustration: a 5% Monday gap on a $1M fund</div>
            <div className="mt-4 space-y-4">
              <Bar label="A plain fund: bots keep" value="about $228" pct={100} tone="dark" />
              <Bar label="Tiffin Fi: the fund keeps" value="about $182" pct={80} tone="accent" />
              <Bar label="Tiffin Fi: bots keep" value="about $46" pct={20} tone="grey" />
            </div>
          </div>
          <div className="rounded-3xl bg-white p-6">
            <div className="label text-[13px] text-[#6b6878]">Live: where the posted fee goes</div>
            <div className="mt-4 space-y-4">
              <Bar label="Stays in the fund" value={fmtPct(fundShare, 0)} pct={fundShare} tone="accent" />
              <Bar label="Protocol" value={fmtPct(100 - fundShare, 0)} pct={100 - fundShare} tone="grey" />
              <Bar label="Gap fees" value="100% to the fund" pct={100} tone="dark" />
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

/* ---------- Live fund card ---------- */

function LiveStat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="rounded-2xl bg-[#F4F3F8] p-4">
      <div className="label text-[12px] text-[#6b6878]">{label}</div>
      <div className="display num mt-1 text-[26px] leading-tight sm:text-[30px]">{children}</div>
    </div>
  )
}

export function LiveFund() {
  const { data } = useFund()
  const sk = <Skeleton className="w-24">0000</Skeleton>
  return (
    <section id="live" className="mt-4 scroll-mt-4 px-1 py-12 sm:px-6 sm:py-16">
      <div className="mx-auto max-w-[1100px]">
        <div className="rounded-[28px] border border-[#E8E7EE] bg-white p-5 sm:p-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-[clamp(28px,4.6vw,44px)] leading-[1.02]">Fund right now</h2>
            <Pill tone={data ? (data.marketOpen ? 'cyan' : 'grey') : 'grey'}>
              <Dot /> {data ? (data.marketOpen ? 'Wall Street open' : 'Wall Street closed') : 'Reading the chain'}
            </Pill>
          </div>
          <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <LiveStat label="Fund value">{data ? fmtUsd(data.nav) : sk}</LiveStat>
            <LiveStat label="One share is worth">{data ? fmtSharePrice(data.sharePrice) : sk}</LiveStat>
            <LiveStat label="Fees earned">{data ? fmtUsd(data.totalFeesUsd) : sk}</LiveStat>
            <LiveStat label="Gap captured">{data ? fmtUsd(data.gapCapturedUsd) : sk}</LiveStat>
          </div>
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
            <p className="label text-[13px] text-[#6b6878]">Read from Arc testnet every 15 seconds. No wallet needed.</p>
            <a href={href('fund')} className="label min-h-11 rounded-full px-4 py-2.5 text-[14px] font-medium text-accent-dark hover:bg-lav">
              See the whole fund
            </a>
          </div>
        </div>
      </div>
    </section>
  )
}

/* ---------- How it works ---------- */

const STEPS = [
  { n: '1', t: 'Buy the basket with USDC', b: 'Pay USDC and receive BSKT, one token that holds a quarter each of Nvidia, Apple, Microsoft and USDC.' },
  { n: '2', t: 'Traders swap against it and pay fees', b: 'Any pair trades against the shared reserve. Every swap pays a fee that stays in the fund.' },
  { n: '3', t: 'Chainlink keeps the clock, so Monday’s gap pays the fund', b: 'When the market reopens, the first bot to close the gap pays most of it back to the fund.' },
]

export function Steps() {
  return (
    <section id="how-it-works" className="scroll-mt-4 px-1 pb-12 sm:px-6 sm:pb-16">
      <div className="mx-auto max-w-[1100px]">
        <h2 className="text-[clamp(30px,5vw,52px)] leading-[1.02]">How it works</h2>
        <ol className="mt-8 grid gap-4 md:grid-cols-3">
          {STEPS.map((s) => (
            <li key={s.n} className="rounded-3xl bg-card p-6">
              <span className="display num grid size-10 place-items-center rounded-full bg-ink text-white">{s.n}</span>
              <h3 className="mt-5 text-[22px] leading-tight">{s.t}</h3>
              <p className="label mt-3 text-[15px] leading-relaxed text-[#55526a]">{s.b}</p>
            </li>
          ))}
        </ol>
        <div className="mt-6">
          <a href={href('how')} className="label inline-flex min-h-11 items-center rounded-full border border-[#c9c7d3] px-5 text-[15px] font-medium hover:bg-[#F2F1F6]">
            Read the details
          </a>
        </div>
      </div>
    </section>
  )
}

/* ---------- Built with ---------- */

export function BuiltWith() {
  const items = ['Arc', 'Uniswap v4', 'Chainlink CRE', 'Arc Studio']
  return (
    <section aria-labelledby="built-with" className="px-1 pb-12 sm:px-6 sm:pb-16">
      <div className="mx-auto max-w-[1100px]">
        <h2 id="built-with" className="label !tracking-normal text-[13px] font-medium uppercase text-[#6b6878]">
          Built with
        </h2>
        <ul className="mt-4 flex flex-wrap gap-3">
          {items.map((t) => (
            <li key={t} className="display rounded-full border border-[#E8E7EE] px-6 py-3 text-[20px] tracking-[-0.04em]">
              {t}
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

/* ---------- Footer ---------- */

export function FooterBlock() {
  return (
    <footer className="on-dark mb-3 overflow-hidden rounded-[28px] bg-ink px-4 pb-6 pt-12 text-white sm:rounded-[32px] sm:px-10 sm:pt-16">
      <div className="mx-auto max-w-[1100px]">
        <p className="label max-w-3xl text-[13px] leading-relaxed text-white/65">
          Hackathon software. Unaudited. The stock tokens are test tokens with no claim on any real share. Nothing here is investment advice, and Tiffin Fi is not a registered fund or ETF. Use Arc testnet only.
        </p>
        <div className="mt-10 select-none overflow-hidden text-center" aria-hidden="true">
          <span className="display block whitespace-nowrap text-[clamp(52px,17vw,230px)] font-bold leading-[0.9] tracking-[-0.06em]">
            <span className="text-accent">T</span>iffin Fi
          </span>
        </div>
        <div className="label mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-5 text-[13px] text-white/60">
          <span>Tiffin Fi on Arc testnet</span>
          <a href={href('fund')} className="min-h-11 py-3 text-white underline underline-offset-4">
            Open app
          </a>
        </div>
      </div>
    </footer>
  )
}
