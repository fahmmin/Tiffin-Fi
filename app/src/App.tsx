import { useEffect, useRef, useState } from 'react'
import { Activity } from './components/Activity.tsx'
import { Fund } from './components/Fund.tsx'
import { How } from './components/How.tsx'
import { ActivityIcon, FundIcon, HowIcon, Mark, TradeIcon } from './components/icons.tsx'
import { Landing } from './components/Landing.tsx'
import { Trade } from './components/Trade.tsx'
import { BANNER, addressUrl, arc } from './config.ts'
import type { Fund as FundState } from './lib/basket.ts'
import { shortAddress } from './lib/format.ts'
import { useFund } from './lib/hooks.ts'
import { useWallet, type Wallet } from './lib/wallet.ts'

const ROUTES = [
  { id: 'fund', label: 'Fund', title: 'The fund', Icon: FundIcon },
  { id: 'trade', label: 'Trade', title: 'Buy, sell or swap', Icon: TradeIcon },
  { id: 'activity', label: 'Activity', title: 'Activity', Icon: ActivityIcon },
  { id: 'how', label: 'How it works', title: 'How it works', Icon: HowIcon },
] as const
type Route = (typeof ROUTES)[number]['id']

/** The app lives at #fund, #trade, #activity and #how; any other hash is the landing page or a section on it. */
const routeFromHash = (): Route | undefined => ROUTES.find((r) => window.location.hash === `#${r.id}`)?.id

export function App() {
  const wallet = useWallet()
  const { fund, error, refresh } = useFund(wallet.address)
  const [route, setRoute] = useState(routeFromHash)
  const firstRender = useRef(true)

  useEffect(() => {
    const onHash = () => setRoute(routeFromHash())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  // On a page change, start at the top and move focus to the new page's title.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false
      return
    }
    window.scrollTo(0, 0)
    document.getElementById('page-title')?.focus({ preventScroll: true })
  }, [route])

  if (!route) return <Landing fund={fund} />

  const page = ROUTES.find((r) => r.id === route)!
  const views = { fund, wallet, refresh }
  return (
    <div className="shell">
      <aside className="side">
        <a className="side-logo" href="#">
          <Mark />
          <span>Tiffin Fi</span>
        </a>
        <p className="side-tagline">A stock basket that gets paid to rebalance</p>
        <nav className="side-nav" aria-label="App">
          {ROUTES.map(({ id, label, Icon }) => (
            <a key={id} href={`#${id}`} aria-current={route === id ? 'page' : undefined}>
              <Icon />
              {label}
            </a>
          ))}
        </nav>
        <div className="side-bottom">
          <NetworkCard fund={fund} error={error} />
          <a className="side-about" href="#">
            About the basket
          </a>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <div className="topbar-title">
            <p className="eyebrow">Tiffin Fi</p>
            <h1 id="page-title" tabIndex={-1}>
              {page.title}
            </h1>
          </div>
          <div className="topbar-actions">
            <NetworkPill fund={fund} error={error} />
            <WalletButton wallet={wallet} />
          </div>
        </header>

        <main className="content" id="main">
          <p className="banner">{BANNER}</p>
          {wallet.error && (
            <p className="alert" role="alert">
              {wallet.error}
            </p>
          )}
          {error && (
            <p className="alert" role="status">
              Cannot reach Arc testnet right now. {fund ? 'Showing the last read; ' : ''}retrying every 15 seconds.
            </p>
          )}
          {route === 'fund' && <Fund fund={fund} />}
          {route === 'trade' && <Trade {...views} />}
          {route === 'activity' && <Activity me={wallet.address} />}
          {route === 'how' && <How fund={fund} />}
          <p className="footnote">
            Every number comes from a contract read on Arc testnet, refreshed every 15 seconds. Reads from{' '}
            {arc.rpcUrls.default.http[0]}.
          </p>
        </main>
      </div>

      <nav className="tabbar" aria-label="App">
        {ROUTES.map(({ id, label, Icon }) => (
          <a key={id} href={`#${id}`} aria-current={route === id ? 'page' : undefined}>
            <Icon />
            <span>{label === 'How it works' ? 'How' : label}</span>
          </a>
        ))}
      </nav>
    </div>
  )
}

function NetworkPill({ fund, error }: { fund?: FundState; error: boolean }) {
  return (
    <p className={`net-pill${error ? ' is-down' : ''}`}>
      <span className="net-dot" aria-hidden="true" />
      Arc testnet · chain {arc.id}
      {fund && <span className="net-block">#{fund.block.toLocaleString('en-US')}</span>}
    </p>
  )
}

function NetworkCard({ fund, error }: { fund?: FundState; error: boolean }) {
  return (
    <div className={`net-card${error ? ' is-down' : ''}`}>
      <p className="net-card-head">
        Arc testnet <span className="net-dot" aria-hidden="true" />
      </p>
      <p>{fund ? `Block ${fund.block.toLocaleString('en-US')}` : 'Connecting…'}</p>
      {fund && <p>Wall Street {fund.marketOpen ? 'open' : 'closed'}, per Chainlink CRE</p>}
    </div>
  )
}

function WalletButton({ wallet }: { wallet: Wallet }) {
  if (!wallet.address) {
    return (
      <button type="button" className="btn btn-primary btn-sm" onClick={wallet.connect} disabled={wallet.connecting}>
        {wallet.connecting ? 'Connecting…' : 'Connect wallet'}
      </button>
    )
  }
  if (!wallet.onArc) {
    return (
      <button type="button" className="btn btn-warn btn-sm" onClick={wallet.requestArc}>
        Switch to Arc testnet
      </button>
    )
  }
  return (
    <a className="account-pill" href={addressUrl(wallet.address)} target="_blank" rel="noreferrer">
      <span className="net-dot" aria-hidden="true" />
      <span className="visually-hidden">Connected as </span>
      {shortAddress(wallet.address)}
    </a>
  )
}
