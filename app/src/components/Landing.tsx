import { useEffect, useState, type ReactNode } from 'react'
import { Basket, Relay, Vault } from '@lucasmarkes/hairline/react'
import { BANNER, HOOK, README_URL, REPLAY_TX, addressUrl, txUrl } from '../config.ts'
import type { Fund } from '../lib/basket.ts'
import { bps, percent, sharePrice, usd } from '../lib/format.ts'
import { Architecture } from './Architecture.tsx'
import { PoolsDiagram } from './How.tsx'
import { ArrowUpRight, Check, Cross, Mark } from './icons.tsx'

const NAV = [
  ['Architecture', '#architecture'],
  ['How it works', '#steps'],
  ['Why it pays', '#compare'],
  ['Proof', '#proof'],
  ['Live fund', '#live'],
  ['Roadmap', '#roadmap'],
] as const

const SOURCES = {
  afterHours: 'https://cryptobriefing.com/robinhood-chain-stock-tokens-after-hours-trading/',
  uniswap: 'https://cryptobriefing.com/uniswap-tokenized-stock-deposits-defi/',
}

function Cta({ href = '#fund', tone = 'primary', children = 'Open app' }: { href?: string; tone?: 'primary' | 'white'; children?: ReactNode }) {
  return (
    <a className={`cta cta-${tone}`} href={href}>
      {children}
      <span className="cta-arrow">
        <ArrowUpRight />
      </span>
    </a>
  )
}

const Chip = ({ children, dark }: { children: ReactNode; dark?: boolean }) => <span className={`chip${dark ? ' is-dark' : ''}`}>{children}</span>

export function Landing({ fund }: { fund?: Fund }) {
  // A section hash (say #proof) on first load: scroll there once the page exists.
  useEffect(() => {
    const id = window.location.hash.slice(1)
    if (id) document.getElementById(id)?.scrollIntoView()
  }, [])

  return (
    <div className="lp">
      <p className="lp-banner">{BANNER}</p>
      <header className="lp-nav">
        <a className="lp-logo" href="#">
          <Mark />
          <span>Tiffin Fi</span>
        </a>
        <nav aria-label="Sections">
          {NAV.map(([label, href]) => (
            <a key={href} href={href}>
              {label}
            </a>
          ))}
        </nav>
        <Cta />
      </header>

      <main>
        <Hero />
        <Parts fund={fund} />
        <Architecture />
        <Versus />
        <Live fund={fund} />
        <Proof />
        <BuiltWith />
        <Stats fund={fund} />
        <Steps />
        <Roadmap />
      </main>
      <Footer />
    </div>
  )
}

function Hero() {
  return (
    <section className="lp-hero" aria-labelledby="hero-title">
      <div className="lp-chips">
        <Chip>Built on Arc</Chip>
        <Chip>A Uniswap v4 hook</Chip>
      </div>
      <h1 id="hero-title" className="lp-hero-title">
        What if your index fund{' '}
        <span className="lp-hero-pill" aria-hidden="true">
          <span className="lp-hero-pill-mark">
            <Mark size={30} />
          </span>
          <span className="lp-hero-pill-dots">
            <i className="asset-0" />
            <i className="asset-1" />
            <i className="asset-2" />
            <i className="asset-3" />
          </span>
        </span>{' '}
        paid you instead of charging you?
      </h1>
      <p className="lp-hero-sub">
        The basket keeps <span className="hl hl-white">Nvidia, Apple, Microsoft</span> and{' '}
        <span className="hl hl-pink">USDC</span> in one token. Traders pay <span className="hl hl-lav">its fees</span>, and
        a Chainlink clock makes <span className="hl hl-dark">Monday's gap pay the fund.</span>
      </p>
      <div className="lp-hero-ctas">
        <Cta />
        <a className="cta cta-outline" href="#compare">
          See the Monday gap
        </a>
      </div>
    </section>
  )
}

function Parts({ fund }: { fund?: Fund }) {
  const [open, setOpen] = useState(0)
  const parts = [
    {
      title: 'The hook',
      body: "A custom curve in beforeSwap. Uniswap v4's own maths swaps nothing; the hook prices every trade with Balancer's weighted formula.",
      stat: '1',
      label: 'hook prices all six pools',
      diagram: true,
    },
    {
      title: 'The shared reserve',
      body: "The fund's balances, held as ERC-6909 claims in the v4 PoolManager. Every pair of the four assets is a pool, and all six trade against this one reserve.",
      stat: fund ? usd(fund.nav) : '6 pools',
      label: fund ? "in the reserve right now, at Chainlink's prices" : 'trade against one reserve',
      Figure: Vault,
    },
    {
      title: 'The market clock',
      body: "A Chainlink CRE workflow writes Wall Street's prices and hours into a clock contract on Arc. The hook reads it on every swap to set the fee and measure the edge.",
      stat: fund ? bps(fund.postedFeeBps) : '0.30%',
      label: fund ? `posted fee right now, with Wall Street ${fund.marketOpen ? 'open' : 'closed'}` : 'posted fee while Wall Street is open',
      Figure: Relay,
    },
    {
      title: 'The fund token',
      body: 'BSKT is your share of the reserve. Buy it with USDC and sell it for USDC. Fees stay in the reserve, so each share redeems for more.',
      stat: fund ? sharePrice(fund.sharePriceUsd) : 'BSKT',
      label: fund ? 'for one BSKT right now' : 'your share of the reserve',
      Figure: Basket,
    },
  ]
  const active = parts[open]
  return (
    <section className="lp-dark lp-parts" id="parts" aria-labelledby="parts-title">
      <div className="lp-why">
        <Chip dark>Why this exists</Chip>
        <p className="lp-statement">
          Tokenized stocks trade all weekend while Wall Street is shut. On Monday the first bot to close the gap takes{' '}
          <span className="lp-accent">what the pool's holders lost.</span>
        </p>
      </div>
      <div className="lp-parts-grid">
        <div>
          <Chip dark>Four parts, one fund</Chip>
          <h2 id="parts-title">What makes the fund pay you?</h2>
          <ul className="lp-accordion">
            {parts.map((p, i) => (
              <li key={p.title} className={i === open ? 'is-open' : undefined}>
                <button type="button" aria-expanded={i === open} aria-controls={`part-${i}`} onClick={() => setOpen(i)}>
                  <span className="num-badge">{String(i + 1).padStart(2, '0')}</span>
                  {p.title}
                </button>
                <p id={`part-${i}`} hidden={i !== open}>
                  {p.body}
                </p>
              </li>
            ))}
          </ul>
        </div>
        <div className="lp-part-card">
          {active.diagram && <PoolsDiagram dark />}
          {active.Figure && <active.Figure play intensity={0.6} theme="dark" label={`Animated figure for ${active.title}`} className="hairline-fig" />}
          <p className="lp-part-kicker">{active.title}</p>
          <strong className="lp-part-stat">{active.stat}</strong>
          <p>{active.label}</p>
        </div>
      </div>
    </section>
  )
}

function Versus() {
  const plain = [
    'Charges you to rebalance',
    "Quotes Friday's price all weekend",
    "The first bot keeps Monday's gap",
    'Fees go to a manager',
  ]
  const basket = [
    'Traders pay it to rebalance',
    "Knows Wall Street's hours through Chainlink",
    'Keeps 80% of the gap for holders',
    'Fees stay in the fund',
  ]
  return (
    <section className="lp-dark lp-versus" id="compare" aria-labelledby="versus-title">
      <Chip dark>Why use a basket</Chip>
      <h2 id="versus-title">
        Same stocks. <span className="lp-accent">The gap pays you.</span>
      </h2>
      <div className="lp-vs">
        <div>
          <h3 className="lp-vs-head">A plain fund or pool</h3>
          <ul className="lp-list is-cross">
            {plain.map((t) => (
              <li key={t}>
                <Cross />
                {t}
              </li>
            ))}
          </ul>
        </div>
        <span className="lp-vs-badge" aria-hidden="true">
          vs
        </span>
        <div>
          <h3 className="lp-vs-head is-us">
            <Mark size={20} /> This basket
          </h3>
          <ul className="lp-list is-check">
            {basket.map((t) => (
              <li key={t}>
                <Check />
                {t}
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className="lp-outcomes">
        <div className="lp-outcome">
          <p>The bot's edge on our Monday replay</p>
          <span className="lp-bar">
            <span className="is-pink" style={{ width: '100%' }} />
          </span>
          <strong>$0.002439</strong>
          <p className="lp-dim">Before any fee. A plain pool lets the bot keep nearly all of it.</p>
        </div>
        <div className="lp-outcome">
          <p>What the bot kept from this basket</p>
          <span className="lp-bar">
            <span className="is-cyan" style={{ width: '20%' }} />
          </span>
          <strong>$0.000488</strong>
          <p className="lp-dim">The fund kept $0.001951, 80% of the edge, for its holders.</p>
        </div>
      </div>
      <p className="lp-source">
        From our Monday replay on Arc testnet: Chainlink's price for Nvidia jumped 5% above the pool, then a bot bought the
        gap.{' '}
        <a href={txUrl(REPLAY_TX)} target="_blank" rel="noreferrer">
          View the transaction
        </a>
        .
      </p>
    </section>
  )
}

function Live({ fund }: { fund?: Fund }) {
  const dots = 21
  const filled = Math.min(fund?.swapCount ?? 0, dots)
  return (
    <section className="lp-live" id="live" aria-labelledby="live-title">
      <div className="lp-card lp-live-card">
        <div className="lp-card-head">
          <h2 id="live-title">The fund right now</h2>
          <p className="lp-net">
            <span className="lp-net-dot" aria-hidden="true" />
            Arc testnet
          </p>
        </div>
        <dl className="lp-live-figures">
          {[
            ['Fund value', fund && usd(fund.nav), "at Chainlink's prices"],
            ['One share', fund && sharePrice(fund.sharePriceUsd), 'of BSKT'],
            ['Fees earned', fund && usd(fund.totalFeesUsd - fund.protocolEarnedUsd), 'for holders'],
            ['Gap captured', fund && usd(fund.gapCapturedUsd), 'from bots'],
          ].map(([label, value, caption]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>
                <strong>{value ?? '…'}</strong>
                <span>{caption}</span>
              </dd>
            </div>
          ))}
        </dl>
        <p className="lp-fine">
          Read live from the hook and the market clock on Arc testnet{fund ? `, block #${fund.block.toLocaleString('en-US')}` : ''}. The fund is
          small because the faucet gives 20 test USDC every two hours.
        </p>
      </div>
      <div className="lp-dark lp-clock-card">
        <div className="lp-dots" aria-hidden="true">
          {Array.from({ length: dots }, (_, i) => (
            <span key={i} className={i < filled ? 'is-on' : undefined} />
          ))}
        </div>
        <p className="lp-clock-state">
          <strong>{fund ? (fund.marketOpen ? 'Open' : 'Closed') : '…'}</strong>
          <span>
            Wall Street, per Chainlink CRE.{fund ? ` Swaps pay ${bps(fund.postedFeeBps)} now.` : ''}
          </span>
        </p>
        <p className="lp-clock-claim">
          {fund ? `${fund.swapCount} swaps so far, one dot each.` : 'Each dot is a swap through the fund.'} Every one paid the
          fund.
        </p>
      </div>
    </section>
  )
}

function Proof() {
  const tests = 14
  const mondayTests = 3
  return (
    <section className="lp-proof" id="proof" aria-labelledby="proof-title">
      <div className="lp-head">
        <h2 id="proof-title">Tested on chain, not on slides.</h2>
        <p>Facts from our build, each with its source.</p>
      </div>
      <div className="lp-bento">
        <article className="lp-tile is-cyan">
          <span className="lp-badge">Monday replay on Arc testnet</span>
          <strong className="lp-big">80%</strong>
          <p>
            of the bot's edge stayed in the fund: $0.001951 of $0.002439.{' '}
            <a href={txUrl(REPLAY_TX)} target="_blank" rel="noreferrer">
              Transaction {REPLAY_TX.slice(0, 8)}…{REPLAY_TX.slice(-4)}
            </a>
          </p>
        </article>
        <article className="lp-tile is-grey">
          <span className="lp-badge is-light">Contract tests</span>
          <strong className="lp-big">{tests}</strong>
          <span className="lp-squares" aria-hidden="true">
            {Array.from({ length: tests }, (_, i) => (
              <i key={i} className={i < mondayTests ? 'is-on' : undefined} />
            ))}
          </span>
          <p>Foundry tests in the repo. The {mondayTests} highlighted replay Monday's gap.</p>
        </article>
        <article className="lp-tile is-dark is-wide">
          <div>
            <p className="lp-kicker">Source code, verified</p>
            <strong className="lp-big lp-accent">6 contracts</strong>
            <p>Verified on the Arc explorer, so anyone can read the code that holds the money.</p>
            <Cta href={addressUrl(HOOK)} tone="white">
              Open the explorer
            </Cta>
          </div>
          <div className="lp-quote">
            <p className="lp-kicker">Chainlink CRE workflow</p>
            <strong className="lp-big">7</strong>
            <p>
              Tests of the workflow: market hours in winter and summer time, the daylight-saving switch, weekends and NYSE
              holidays, and the report it writes to the clock.
            </p>
          </div>
        </article>
      </div>
    </section>
  )
}

function BuiltWith() {
  return (
    <section className="lp-built" aria-label="Built with">
      <span className="lp-built-label">Built with</span>
      <span className="wm wm-arc">Arc</span>
      <span className="wm wm-uni">Uniswap v4</span>
      <span className="wm wm-link">Chainlink CRE</span>
      <span className="wm wm-foundry">Foundry</span>
      <span className="wm wm-viem">viem</span>
    </section>
  )
}

function Stats({ fund }: { fund?: Fund }) {
  return (
    <section className="lp-stats" aria-label="The numbers">
      <div>
        <strong>59%</strong>
        <p>
          of Robinhood Chain stock-token DEX volume traded outside regular US hours, 24 Sep to 23 Oct 2026.{' '}
          <a href={SOURCES.afterHours} target="_blank" rel="noreferrer">
            Crypto Briefing
          </a>
        </p>
      </div>
      <div>
        <strong>$20.9B</strong>
        <p>
          of tokenized-stock DEX volume in the 30 days to 28 Sep, about 60% of it on Uniswap.{' '}
          <a href={SOURCES.uniswap} target="_blank" rel="noreferrer">
            Crypto Briefing
          </a>
        </p>
      </div>
      <div>
        <strong>
          6<sup>pools</sup>
        </strong>
        <p>trade against 1 reserve in this fund, one per pair of the four assets.</p>
      </div>
      <div>
        <strong>{fund ? percent(fund.fees.gapShare / 10_000, 0) : '80%'}</strong>
        <p>of the gap kept for holders, read from the hook on Arc.</p>
      </div>
    </section>
  )
}

function Steps() {
  const steps = [
    ['Buy the basket with USDC', 'One token holds Nvidia, Apple, Microsoft and USDC, a quarter each.'],
    ['Traders swap against it and pay fees', 'Every swap pays at least the posted fee, and the fees stay in the fund.'],
    ["Chainlink keeps the clock, so Monday's gap pays the fund", "When Wall Street reopens, the gap fee keeps 80% of the first bot's edge."],
  ]
  return (
    <section className="lp-steps" id="steps" aria-labelledby="steps-title">
      <div className="lp-card is-grey lp-steps-left">
        <div className="lp-steps-top">
          <h2 id="steps-title">How the basket works.</h2>
          <p>The same loop on every trading day, and over every weekend.</p>
        </div>
        <p className="lp-illustration">
          <span className="lp-badge is-light">Illustration</span> On a $1M fund, a 5% Monday gap in Nvidia is worth about
          $228 to bots. The fund keeps $182.
        </p>
        <p className="lp-steps-count">
          <strong>3</strong>
          <span>steps, and you only do the first.</span>
        </p>
      </div>
      <div className="lp-dark lp-steps-right">
        <p className="lp-steps-head">3 steps</p>
        <ol>
          {steps.map(([title, body], i) => (
            <li key={title} className={i === 1 ? 'is-active' : undefined}>
              <span className="num-badge">{String(i + 1).padStart(2, '0')}</span>
              <div>
                <h3>{title}</h3>
                <p>{body}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}

function Roadmap() {
  const items = [
    ['Real tokenized stocks', 'Swap the test tokens for real ones, such as xStocks or Ondo, in the same reserve.'],
    ['Chainlink 24/7 prices', "Round-the-clock equity prices, so the fund can price the weekend and not only Monday's open."],
    ['More baskets and weights', 'Other sets of stocks and unequal weights, priced with the same weighted maths.'],
    ['A capped mainnet launch', 'A deposit cap while the contracts earn trust, after an audit.'],
  ]
  return (
    <section className="lp-roadmap" id="roadmap" aria-labelledby="roadmap-title">
      <Chip>After the hackathon</Chip>
      <h2 id="roadmap-title">Where the basket goes next.</h2>
      <ol>
        {items.map(([title, body], i) => (
          <li key={title}>
            <span className={`num-badge${i === 0 ? ' is-accent' : ' is-light'}`}>{String(i + 1).padStart(2, '0')}</span>
            <h3>{title}</h3>
            <p>{body}</p>
          </li>
        ))}
      </ol>
    </section>
  )
}

function Footer() {
  return (
    <footer className="lp-dark lp-footer">
      <div className="lp-footer-top">
        <div>
          <p className="lp-footer-claim">Your index fund, paid to rebalance.</p>
          <Cta tone="white" />
        </div>
        <nav aria-label="App pages" className="lp-footer-links">
          <a href="#fund">Fund</a>
          <a href="#trade">Trade</a>
          <a href="#activity">Activity</a>
          <a href="#how">How it works</a>
          {README_URL && (
            <a href={README_URL} target="_blank" rel="noreferrer">
              README
            </a>
          )}
        </nav>
      </div>
      <p className="lp-wordmark" aria-hidden="true">
        <span>T</span>iffin Fi
      </p>
      <p className="lp-disclaimer">
        Tiffin Fi is hackathon software built at ETHGlobal Mumbai. The contracts are unaudited and the stock
        tokens are test tokens. Not investment advice, and not a registered fund or ETF. Nvidia, Apple, Microsoft, Uniswap,
        Chainlink and Arc are their owners' names.
      </p>
    </footer>
  )
}
