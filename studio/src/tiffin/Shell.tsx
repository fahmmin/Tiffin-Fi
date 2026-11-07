import type { ReactNode } from 'react'
import { Activity, ArrowLeftRight, Info, PieChart } from 'lucide-react'
import { CHAIN_ID } from './config'
import { APP_ROUTES, href, type Route } from './route'
import { PENDING, ReadBanner, Wordmark } from './ui'
import { useFund } from './useFund'
import { useWallet } from './wallet'
import { WalletButton } from './WalletButton'

const ICONS = { fund: PieChart, trade: ArrowLeftRight, activity: Activity, how: Info } as const

export const FOOTNOTE = 'Every number comes from a contract read on Arc testnet, refreshed every 15 seconds.'

function StatusDot({ live }: { live: boolean }) {
  return <span className={`size-2 shrink-0 rounded-full ${live ? 'bg-ok' : 'bg-ink-3'}`} aria-hidden="true" />
}

export function Shell({ route, children }: { route: Exclude<Route, 'landing'>; children: ReactNode }) {
  const { data, error } = useFund()
  const w = useWallet()
  const title = APP_ROUTES.find((r) => r.id === route)?.title ?? ''
  const block = data ? data.block.toLocaleString('en-US') : PENDING
  const market = data ? (data.marketOpen ? 'open' : 'closed') : null

  return (
    <div className="min-h-dvh bg-ground lg:pl-[248px]">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 hidden w-[248px] flex-col border-r border-line bg-white px-4 py-6 lg:flex">
        <a href={href('landing')} className="rounded-xl px-2" aria-label="Dabba home">
          <Wordmark />
        </a>
        <p className="label mt-2 px-2 text-[12px] leading-snug text-ink-2">A stock basket that gets paid to rebalance</p>
        <nav className="mt-7 flex flex-col gap-1" aria-label="App">
          {APP_ROUTES.map((r) => {
            const Icon = ICONS[r.id]
            const active = r.id === route
            return (
              <a
                key={r.id}
                href={href(r.id)}
                aria-current={active ? 'page' : undefined}
                className={`label flex min-h-11 items-center gap-3 rounded-xl px-3.5 text-[15px] font-medium transition ${active ? 'bg-ink text-white' : 'text-ink-2 hover:bg-well'}`}
              >
                <Icon className={`size-[18px] ${active ? 'text-accent-deep' : ''}`} strokeWidth={1.8} aria-hidden="true" />
                {r.label}
              </a>
            )
          })}
        </nav>
        <div className="mt-auto rounded-2xl bg-well p-4">
          <div className="flex items-center justify-between">
            <span className="label text-[13px] font-bold">Arc testnet</span>
            <StatusDot live={!!data} />
          </div>
          <div className="label num mt-1.5 text-[12px] leading-snug text-ink-2">Block {block}</div>
          <div className="label text-[12px] leading-snug text-ink-2">
            {market ? `Wall Street ${market}, per Chainlink CRE` : `Wall Street ${PENDING}, per Chainlink CRE`}
          </div>
        </div>
        <a href={href('landing')} className="label mt-4 rounded-lg px-2 py-1 text-[13px] text-ink-2 hover:text-ink">
          About the basket
        </a>
      </aside>

      {/* Top bar */}
      <header className="sticky top-0 z-30 border-b border-line bg-ground/90 backdrop-blur">
        <div className="mx-auto flex max-w-[1130px] flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-0 sm:py-4 lg:max-w-none lg:px-8">
          <div className="min-w-0">
            <div className="label text-[12px] text-ink-2">Dabba</div>
            <h1 className="display text-[28px] leading-none">{title}</h1>
          </div>
          <div className="flex flex-col items-end gap-2 sm:flex-row sm:items-center sm:gap-3">
            <span className="label inline-flex items-center gap-2 rounded-full bg-white px-3.5 py-2 text-[13px] shadow-card">
              <StatusDot live={!!data} />
              Arc testnet · chain {CHAIN_ID}
              <span className="num text-ink-2">#{block}</span>
            </span>
            <WalletButton />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1130px] px-4 pb-28 pt-5 sm:px-0 lg:max-w-none lg:px-8 lg:pb-12">
        <div className="mx-auto max-w-[1130px] lg:mx-0">
          <ReadBanner message={error} className="mb-4" />
          {w.error && (
            <p role="alert" className="label mb-4 rounded-2xl bg-bad-soft px-4 py-3 text-[13px] font-medium text-bad">
              {w.error}
            </p>
          )}
          {children}
          <p className="label mt-8 text-[12px] leading-relaxed text-ink-2">{FOOTNOTE}</p>
        </div>
      </main>

      {/* Phone tab bar */}
      <nav
        className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-white pb-[env(safe-area-inset-bottom)] lg:hidden"
        aria-label="App tabs"
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
                  aria-label={r.label}
                  className={`label flex min-h-[60px] flex-col items-center justify-center gap-1 text-[12px] font-medium ${active ? 'text-accent' : 'text-ink-2'}`}
                >
                  <Icon className="size-5" strokeWidth={active ? 2.2 : 1.8} aria-hidden="true" />
                  {r.short}
                </a>
              </li>
            )
          })}
        </ul>
      </nav>
    </div>
  )
}
