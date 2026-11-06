import { ASSETS, FAUCET_URL, STOCKS, USDC } from '../config.ts'
import { valueUsd, type Fund as FundState } from '../lib/basket.ts'
import { ago, amount, bps, cityTime, percent, sharePrice, usd } from '../lib/format.ts'
import { useNow } from '../lib/hooks.ts'

export function Fund({ fund }: { fund?: FundState }) {
  if (!fund) return <p className="card muted">Reading the fund from Arc testnet…</p>
  return (
    <div className="fund-grid">
      <Overview fund={fund} />
      <Clock fund={fund} />
      <Paid fund={fund} />
      <Holdings fund={fund} />
    </div>
  )
}

/** Market state as a small coloured pill: open, closed, or stale prices. */
export function MarketPill({ fund }: { fund: FundState }) {
  const [tone, text] = !fund.fresh
    ? ['bad', 'Prices stale']
    : fund.marketOpen
      ? ['ok', 'Wall Street open']
      : ['neutral', 'Wall Street closed']
  return <span className={`pill pill-${tone}`}>{text}</span>
}

function Overview({ fund }: { fund: FundState }) {
  const user = fund.user
  const held = user && fund.supply > 0n ? (user.bskt * fund.nav) / fund.supply : 0n
  return (
    <section className="card overview" aria-labelledby="overview-title">
      <div className="card-head">
        <h2 id="overview-title">Stock Basket (BSKT)</h2>
        <span className="pill pill-neutral">Arc testnet</span>
      </div>
      <p className="muted">Nvidia, Apple, Microsoft and USDC, a quarter each, in one token. Traders pay it to swap.</p>
      <dl className="figures">
        <div>
          <dt>One share is worth</dt>
          <dd className="figure-accent">{sharePrice(fund.sharePriceUsd)}</dd>
        </div>
        <div>
          <dt>Fund value</dt>
          <dd>{usd(fund.nav)}</dd>
        </div>
        <div>
          <dt>Shares issued</dt>
          <dd>{amount(fund.supply, 18)}</dd>
        </div>
      </dl>
      {user && (
        <div className="holding">
          <p>
            <span className="muted">You hold</span> <strong>{amount(user.bskt, 18)} BSKT</strong>
            {user.bskt > 0n && (
              <>
                , worth <strong>{usd(held)}</strong>
              </>
            )}
          </p>
          <p>
            <span className="muted">Your wallet has</span> <strong>{amount(user.balances[USDC], 6)} USDC</strong>
            {user.balances[USDC] < 1_000_000n && (
              <>
                {' '}
                <a href={FAUCET_URL} target="_blank" rel="noreferrer">
                  Get test USDC
                </a>
              </>
            )}
          </p>
        </div>
      )}
      {!fund.fresh && <p className="note-bad">Chainlink's prices are stale, so these values use the last reported prices.</p>}
    </section>
  )
}

function Clock({ fund }: { fund: FundState }) {
  const now = useNow()
  const age = Math.max(0, now / 1000 - fund.pricesUpdatedAt)
  const state = !fund.fresh ? 'stale' : fund.marketOpen ? 'open' : 'closed'
  const regimes = [
    { id: 'open', label: 'Market open', fee: fund.fees.open },
    { id: 'closed', label: 'Market closed', fee: fund.fees.closed },
    { id: 'stale', label: 'Prices stale', fee: fund.fees.stale },
  ]
  return (
    <section className="card" aria-labelledby="clock-title">
      <div className="card-head">
        <h2 id="clock-title">Wall Street's clock</h2>
        <MarketPill fund={fund} />
      </div>
      <p className="cities">
        <span>
          New York <time>{cityTime('America/New_York', new Date(now))}</time>
        </span>
        <span>
          Mumbai <time>{cityTime('Asia/Kolkata', new Date(now))}</time>
        </span>
      </p>
      <p className="label">Posted fee on every swap</p>
      <ul className="meter" aria-label="Posted fee in each market state">
        {regimes.map((r) => (
          <li key={r.id} aria-current={r.id === state ? 'true' : undefined}>
            <span>
              {r.label}
              {r.id === state && <span className="visually-hidden"> (now)</span>}
            </span>
            <strong>{bps(r.fee)}</strong>
          </li>
        ))}
      </ul>
      <p className={fund.fresh ? 'muted small' : 'note-bad'}>
        {fund.pricesUpdatedAt === 0
          ? 'Chainlink CRE has not reported prices yet.'
          : fund.fresh
            ? `Chainlink CRE updated Wall Street's prices ${ago(age)}.`
            : `Prices are stale: Chainlink CRE last reported ${ago(age)}, past the ${fund.maxPriceAge / 3600}-hour limit.`}
      </p>
    </section>
  )
}

function Paid({ fund }: { fund: FundState }) {
  return (
    <section className="card" aria-labelledby="paid-title">
      <div className="card-head">
        <h2 id="paid-title">What traders have paid</h2>
      </div>
      <p className="big-number">{usd(fund.totalFeesUsd - fund.protocolEarnedUsd)}</p>
      <p className="muted small">Fees earned for holders. They stay in the reserve, so each share redeems for more.</p>
      <dl className="rows">
        <div>
          <dt>Gap captured from bots</dt>
          <dd>{usd(fund.gapCapturedUsd)}</dd>
        </div>
        <div>
          <dt>Protocol share</dt>
          <dd>{usd(fund.protocolEarnedUsd)}</dd>
        </div>
        <div>
          <dt>Swaps</dt>
          <dd>{fund.swapCount.toLocaleString('en-US')}</dd>
        </div>
      </dl>
      <p className="muted small">Gap fees go entirely to holders, so they are part of the figure above.</p>
    </section>
  )
}

function Holdings({ fund }: { fund: FundState }) {
  const values = ASSETS.map((_, i) => valueUsd(fund, i, fund.reserves[i]))
  const nav = Number(fund.nav) || 1
  const shares = values.map((v) => Number(v) / nav)
  return (
    <section className="card holdings" aria-labelledby="holdings-title">
      <div className="card-head">
        <h2 id="holdings-title">What the fund holds</h2>
        <span className="muted small">A quarter each by value</span>
      </div>
      <div className="weights" role="img" aria-label={ASSETS.map((a, i) => `${a.name} ${percent(shares[i], 1)}`).join(', ')}>
        {values.map((_, i) => (
          <span key={i} className={`asset-${i}`} style={{ flexGrow: shares[i] }} />
        ))}
      </div>
      <ul className="slices">
        {ASSETS.map((a, i) => (
          <li key={a.symbol}>
            <span className={`swatch asset-${i}`} aria-hidden="true" />
            <div className="slice-name">
              <strong>{a.name}</strong>
              <span className="muted">
                {amount(fund.reserves[i], a.decimals)} {a.symbol}
              </span>
            </div>
            <div className="slice-value">
              <strong>{usd(values[i])}</strong>
              <span className="muted">{percent(shares[i], 1)}</span>
            </div>
            {i < STOCKS.length && <PriceCheck pool={fund.poolPrices[i]} reference={fund.refPrices[i]} />}
          </li>
        ))}
      </ul>
    </section>
  )
}

function PriceCheck({ pool, reference }: { pool: bigint; reference: bigint }) {
  const gap = reference ? Number(pool) / Number(reference) - 1 : 0
  const inLine = Math.abs(gap) < 0.0005
  return (
    <p className="price-check">
      <span>
        Pool {usd(pool)}, Chainlink {usd(reference)}
      </span>
      <span className={`pill ${inLine ? 'pill-ok' : 'pill-warn'}`}>
        {inLine ? 'In line' : `Pool ${percent(Math.abs(gap))} ${gap < 0 ? 'below' : 'above'}`}
      </span>
    </p>
  )
}
