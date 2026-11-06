import type { ReactNode } from 'react'
import { Activity, ArrowLeftRight, Info, PieChart } from 'lucide-react'
import { CHAIN_ID } from './config'
import { href, APP_ROUTES, type Route } from './route'
import { Dot, Skeleton, Wordmark } from './ui'
import { useFund } from './useFund'
import { useWallet } from './wallet'
import { WalletButton } from './WalletButton'

const ICONS = { fund: PieChart, trade: ArrowLeftRight, activity: Activity, how: Info } as const

export const NOTICE = 'Arc testnet. The stock tokens are test tokens; the prices are real and the fund settles in Arc USDC.'

function NetworkDot({ live }: { live: boolean }) {
  return <span className={`size-2 rounded-full ${live ? 'bg-[#0E8A9E] pulse-dot' : 'bg-[#c9c7d3]'}`} aria-hidden="true" />
}

export function Shell({ route, children }: { route: Exclude<Route, 'landing'>; children: ReactNode }) {
  const { data, error } = useFund()
  const w = useWallet()
  const title = APP_ROUTES.find((r) => r.id === route)?.title ?? ''
  const block = data ? data.block.toLocaleString('en-US') : null

  return (
    <div className="min-h-dvh bg-ground lg:pl-[248px]">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 hidden w-[248px] flex-col border-r border-[#E8E7EE] bg-white px-4 py-5 lg:flex">
        <a href={href('landing')} className="rounded-xl px-2" aria-label="Tiffin Fi home">
          <Wordmark />
        </a>
        <p className="label mt-2 px-2 text-[12px] leading-snug text-[#6b6878]">A stock basket that gets paid to rebalance</p>
        <nav className="mt-6 flex flex-col gap-1" aria-label="App">
          {APP_ROUTES.map((r) => {
            const Icon = ICONS[r.id]
            const active = r.id === route
            return (
              <a
                key={r.id}
                href={href(r.id)}
                aria-current={active ? 'page' : undefined}
                className={`flex min-h-11 items-center gap-3 rounded-2xl px-4 text-[15px] font-medium transition ${active ? 'bg-ink text-white' : 'text-[#4a4757] hover:bg-[#F2F1F6]'}`}
              >
                <Icon className="size-[18px]" strokeWidth={1.8} aria-hidden="true" />
                {r.label}
              </a>
            )
          })}
        </nav>
        <div className="mt-auto rounded-2xl bg-[#F2F1F6] p-4">
          <div className="flex items-center justify-between">
            <span className="label text-[13px] font-semibold">Arc testnet</span>
            <NetworkDot live={!!data} />
          </div>
          <div className="label mt-1 text-[12px] text-[#6b6878]">
            Latest block {block ? <span className="num">{block}</span> : <Skeleton className="w-16">0000</Skeleton>}
          </div>
        </div>
        <a href={href('landing')} className="label mt-3 px-2 text-[13px] text-[#6b6878] hover:text-ink">
          About the basket
        </a>
      </aside>

      {/* Top bar */}
      <header className="sticky top-0 z-30 border-b border-[#E8E7EE] bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-[1180px] flex-wrap items-center justify-between gap-x-3 gap-y-2 px-4 py-3 sm:px-6">
          <div className="min-w-0">
            <div className="label text-[12px] text-[#6b6878]">Tiffin Fi</div>
            <h1 className="display text-[26px] leading-none sm:text-[28px]">{title}</h1>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2 sm:gap-3">
            <span className="label inline-flex items-center gap-2 rounded-full border border-[#E8E7EE] bg-white px-3 py-1.5 text-[12px] sm:px-3.5 sm:py-2 sm:text-[13px]">
              <NetworkDot live={!!data} />
              Arc testnet · chain {CHAIN_ID}
              {block && <span className="num text-[#6b6878]">#{block}</span>}
            </span>
            <WalletButton compact />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1180px] px-4 pb-28 pt-5 sm:px-6 lg:pb-12">
        <p className="label mb-4 rounded-2xl border border-[#E1DBFB] bg-lav px-4 py-3 text-[13px] leading-snug text-[#2c2250] sm:text-[14px]">{NOTICE}</p>
        {w.error && (
          <p role="alert" className="label mb-4 rounded-2xl bg-[#FFE9E9] px-4 py-3 text-[13px] text-[#8C1C1C]">
            {w.error}
          </p>
        )}
        {error && !data && (
          <p role="alert" className="label mb-4 rounded-2xl bg-[#FFF1D6] px-4 py-3 text-[13px] text-[#6B4500]">
            {error}
          </p>
        )}
        {children}
        <p className="label mt-8 text-[12px] leading-relaxed text-[#6b6878]">
          Every number comes from a contract read on Arc testnet, refreshed every 15 seconds. Hackathon software, unaudited.
        </p>
      </main>

      {/* Mobile tab bar */}
      <nav
        className="fixed inset-x-0 bottom-0 z-40 border-t border-[#E8E7EE] bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
        aria-label="App"
      >
        <ul className="mx-auto grid max-w-md grid-cols-4">
          {APP_ROUTES.map((r) => {
            const Icon = ICONS[r.id]
            const active = r.id === route
            return (
              <li key={r.id}>
                <a
                  href={href(r.id)}
                  aria-current={active ? 'page' : undefined}
                  className={`flex min-h-[60px] flex-col items-center justify-center gap-1 text-[11px] font-medium ${active ? 'text-accent' : 'text-[#6b6878]'}`}
                >
                  <Icon className="size-5" strokeWidth={active ? 2.2 : 1.8} aria-hidden="true" />
                  {r.id === 'how' ? 'How it works' : r.label}
                  {active && <Dot className="hidden" />}
                </a>
              </li>
            )
          })}
        </ul>
      </nav>
    </div>
  )
}
