import { useState } from 'react'
import { Card } from '../ui'
import { useFund } from '../useFund'
import { fmtBps } from '../format'
import { Buy } from './Buy'
import { Sell } from './Sell'
import { Swap } from './Swap'

const TABS = [
  { id: 'buy', label: 'Buy' },
  { id: 'sell', label: 'Sell' },
  { id: 'swap', label: 'Swap' },
] as const

type Tab = (typeof TABS)[number]['id']

const BLURB: Record<Tab, string> = {
  buy: 'Pay USDC, receive BSKT: a quarter each of Nvidia, Apple, Microsoft and USDC.',
  sell: 'Turn BSKT back into USDC. A quarter-sized slice of the posted fee stays in the fund.',
  swap: 'Trade any pair of the four assets. Every swap pays the fund.',
}

export function TradePage() {
  const [tab, setTab] = useState<Tab>('buy')
  const { data } = useFund()
  return (
    <div className="mx-auto max-w-[520px]">
      <Card className="!p-4 sm:!p-6">
        <div role="tablist" aria-label="Trade type" className="grid grid-cols-3 gap-1 rounded-full bg-[#F1F0F5] p-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              id={`tab-${t.id}`}
              aria-selected={tab === t.id}
              aria-controls={`panel-${t.id}`}
              onClick={() => setTab(t.id)}
              className={`display min-h-11 rounded-full text-[15px] transition ${tab === t.id ? 'bg-ink text-white shadow-sm' : 'text-[#4a4757] hover:bg-white'}`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <p className="label mt-4 text-[14px] text-[#55526a]">{BLURB[tab]}</p>
        <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} className="mt-4">
          {tab === 'buy' && <Buy />}
          {tab === 'sell' && <Sell />}
          {tab === 'swap' && <Swap />}
        </div>
      </Card>
      {data && (
        <p className="label mt-3 px-2 text-[12px] text-[#6b6878]">
          Posted fee right now {fmtBps(data.postedBps)}. A trade that beats Chainlink's price pays the fund 80% of that edge instead.
        </p>
      )}
    </div>
  )
}
