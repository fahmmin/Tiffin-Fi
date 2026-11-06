import { useState } from 'react'
import { fmtToken } from '../format'
import { Card } from '../ui'
import { useFund } from '../useFund'
import { Buy } from './Buy'
import { Sell } from './Sell'
import { Swap } from './Swap'

const TABS = [
  { id: 'buy', label: 'Buy' },
  { id: 'sell', label: 'Sell' },
  { id: 'swap', label: 'Swap' },
] as const

type Tab = (typeof TABS)[number]['id']

const TITLES: Record<Tab, string> = {
  buy: 'How buying works',
  sell: 'How selling works',
  swap: 'How swapping works',
}

function Explainer({ tab }: { tab: Tab }) {
  const { data } = useFund()
  const posted = data ? (data.postedBps / 100).toFixed(2) : null
  const threeQ = data ? ((data.postedBps * 0.75) / 100).toFixed(2) : null
  const gap = data ? data.gapShareBps / 100 : null
  const protocol = data ? data.protocolShareBps / 100 : null
  const cap = data ? fmtToken((data.reserves[3] * 3000n) / 10_000n, 6) : null
  const bullets: Record<Tab, string[]> = {
    buy: [
      'You pay USDC and the fund mints BSKT: your share of all four slices.',
      `Three quarters of a one-asset buy becomes stocks, so that part pays the posted fee: ${threeQ ?? '…'}% now.`,
      `One buy can be at most 30% of the fund's USDC, ${cap ?? '…'} USDC right now.`,
      'Before you send it, the app simulates the buy on Arc and sets your minimum 0.5% below the result.',
    ],
    sell: [
      'You hand back BSKT and the fund pays you in USDC.',
      `Three quarters of the sale is stocks turned into USDC, so that part pays the posted fee: ${threeQ ?? '…'}% now. The fee stays in the fund.`,
      `One sale can take at most 30% of the fund's USDC, ${cap ?? '…'} USDC right now.`,
      'The app simulates the sale on Arc first and sets your minimum 0.5% below the result.',
    ],
    swap: [
      'Pick any two of USDC, tNVDA, tAAPL and tMSFT. Every pair is its own pool, and all six share one reserve.',
      `Every swap pays the larger of the posted fee, ${posted ?? '…'}% now, or ${gap ?? '…'}% of the edge you get against Chainlink's prices.`,
      `If you are buying below Chainlink's price, that edge goes to the fund. If not, the posted fee applies and the protocol takes ${protocol ?? '…'}% of it.`,
      'You see the exact quote from the hook before you send, with a minimum 0.5% below it.',
    ],
  }
  return (
    <Card className="self-start">
      <h2 className="display text-[24px]">{TITLES[tab]}</h2>
      <ul className="label mt-4 space-y-3 text-[15px] leading-relaxed text-ink-2">
        {bullets[tab].map((b) => (
          <li key={b} className="flex gap-3">
            <span className="mt-[9px] size-1.5 shrink-0 rounded-full bg-accent" aria-hidden="true" />
            <span>{b}</span>
          </li>
        ))}
      </ul>
    </Card>
  )
}

export function TradePage() {
  const [tab, setTab] = useState<Tab>('buy')
  return (
    <div className="grid items-start gap-4 lg:grid-cols-[1.12fr_1fr]">
      <Card className="!p-4 sm:!p-6">
        <div role="tablist" aria-label="Trade type" className="grid grid-cols-3 gap-1 rounded-2xl bg-well p-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              id={`tab-${t.id}`}
              aria-selected={tab === t.id}
              aria-controls={`panel-${t.id}`}
              onClick={() => setTab(t.id)}
              className={`label min-h-11 rounded-xl text-[15px] font-semibold transition ${tab === t.id ? 'bg-white text-ink shadow-card' : 'text-ink-2 hover:text-ink'}`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} className="mt-4">
          {tab === 'buy' && <Buy />}
          {tab === 'sell' && <Sell />}
          {tab === 'swap' && <Swap />}
        </div>
      </Card>
      <Explainer tab={tab} />
    </div>
  )
}
