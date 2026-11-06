import { ASSETS, CLOCK, HOOK, ROUTER, addressUrl } from '../config.ts'
import type { Fund } from '../lib/basket.ts'
import { bps, percent } from '../lib/format.ts'

const ticker = (i: number) => ASSETS[i].symbol.replace(/^t/, '')

/** Six pools, one per pair of the four assets, all pointing at one hook. */
export function PoolsDiagram({ dark = false }: { dark?: boolean }) {
  const pairs = [
    [0, 3],
    [1, 3],
    [2, 3],
    [0, 1],
    [1, 2],
    [0, 2],
  ]
  return (
    <svg
      className={`pools${dark ? ' is-dark' : ''}`}
      viewBox="-160 -96 320 192"
      role="img"
      aria-label="Six pools, one for each pair of the four assets, all pointing at one hook that holds one shared reserve"
    >
      {pairs.map(([a, b], k) => {
        const t = (k / pairs.length) * Math.PI * 2 - Math.PI / 2
        const [x, y] = [Math.cos(t) * 118, Math.sin(t) * 68]
        return (
          <g key={k}>
            <line x1={x * 0.8} y1={y * 0.8} x2={x * 0.3} y2={y * 0.3} className="pools-spoke" />
            <rect x={x - 46} y={y - 13} width="92" height="26" rx="13" className="pools-pool" />
            <text x={x} y={y + 4} textAnchor="middle" className="pools-label">
              {ticker(a)}/{ticker(b)}
            </text>
          </g>
        )
      })}
      <ellipse rx="46" ry="27" className="pools-hook" />
      <text y="-2" textAnchor="middle" className="pools-hook-label">
        One hook
      </text>
      <text y="13" textAnchor="middle" className="pools-hook-sub">
        one reserve
      </text>
    </svg>
  )
}

export function How({ fund }: { fund?: Fund }) {
  const f = fund?.fees
  const open = f ? bps(f.open) : '0.30%'
  const closed = f ? bps(f.closed) : '0.60%'
  const stale = f ? bps(f.stale) : '2.00%'
  const gapShare = f ? percent(f.gapShare / 10_000, 0) : '80%'
  const protocol = f ? percent(f.protocolShare / 10_000, 0) : '10%'
  const keep = f ? percent(1 - f.protocolShare / 10_000, 0) : '90%'
  return (
    <div className="how-grid">
      <section className="card" aria-labelledby="pools-title">
        <h2 id="pools-title">One hook runs six pools</h2>
        <PoolsDiagram />
        <p>
          Every pair of the four assets is its own Uniswap v4 pool, six in all, and all six point at one hook on Arc. The
          hook is the price curve: it keeps one shared reserve for the whole fund and prices each trade with Balancer's
          weighted maths, which with equal weights is x × y = k on the two balances being traded. A swap in any pool pays
          the same fund.
        </p>
      </section>

      <section className="card" aria-labelledby="fees-title">
        <h2 id="fees-title">Each swap pays the larger of two fees</h2>
        <dl className="rules">
          <div>
            <dt>The posted fee</dt>
            <dd>
              {open} while Wall Street is open, {closed} while it is closed and {stale} if Chainlink's prices are stale.{' '}
              {keep} stays in the fund and {protocol} goes to the protocol.
            </dd>
          </div>
          <div>
            <dt>The gap fee</dt>
            <dd>
              {gapShare} of the trade's edge: what the trader receives, valued at Chainlink's reference price, minus what
              they paid. All of it stays in the fund.
            </dd>
          </div>
        </dl>
        <p>
          That is how the fund stops the first bot after Monday's open from taking the weekend gap. The bot keeps 20% of
          its edge, so closing the gap is still its best trade, and holders get the rest.
        </p>
        <figure className="example">
          <figcaption>
            <span className="pill pill-neutral">Illustration, not live data</span> A $1M fund over a weekend, and Nvidia
            opens 5% higher on Monday.
          </figcaption>
          <div className="split" role="img" aria-label="Of the 228 dollar gap, the fund keeps 182 dollars and the bot keeps 46">
            <span className="split-fund" style={{ flexGrow: 182 }}>
              Fund $182
            </span>
            <span className="split-bot" style={{ flexGrow: 46 }}>
              Bot $46
            </span>
          </div>
          <p className="muted small">
            Trading the pool up to the new price is worth about $228 to the first bot. The gap fee keeps $182 of it for
            holders, and the bot keeps $46.
          </p>
        </figure>
      </section>

      <section className="card" aria-labelledby="clock-how-title">
        <h2 id="clock-how-title">Wall Street's clock, from Chainlink CRE</h2>
        <p>
          A Chainlink CRE workflow writes Wall Street's reference prices, and whether the market is open, into a clock
          contract on Arc. The hook reads it on every trade to pick the posted fee and to measure each trade's edge.
        </p>
        <p className="muted small">
          tNVDA, tAAPL and tMSFT are testnet stand-ins with no value. Only the deployer can mint them, so you get them by
          buying with USDC. Not a registered fund or ETF.
        </p>
      </section>

      <section className="card" aria-labelledby="contracts-title">
        <h2 id="contracts-title">Contracts on Arc testnet</h2>
        <dl className="rows">
          {[
            ['The hook and the BSKT token', HOOK],
            ['The router', ROUTER],
            ['The market clock', CLOCK],
          ].map(([label, address]) => (
            <div key={address}>
              <dt>{label}</dt>
              <dd>
                <a href={addressUrl(address as `0x${string}`)} target="_blank" rel="noreferrer">
                  {address.slice(0, 6)}…{address.slice(-4)}
                </a>
              </dd>
            </div>
          ))}
        </dl>
        <p className="muted small">Verified on the Arc explorer, so anyone can read the code that holds the money.</p>
      </section>
    </div>
  )
}
