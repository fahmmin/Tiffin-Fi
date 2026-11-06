import { addressUrl } from '../chain'
import { CLOCK, HOOK, ROUTER } from '../config'
import { PoolDiagram } from '../diagrams'
import { fmtBps, shortAddr } from '../format'
import { Card, Dot, PENDING, Pill } from '../ui'
import { useFund } from '../useFund'

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-line py-4 first:border-t-0 first:pt-0">
      <h3 className="display text-[18px]">{title}</h3>
      <div className="label mt-1.5 text-[15px] leading-relaxed text-ink-2">{children}</div>
    </div>
  )
}

export function HowPage() {
  const { data } = useFund()
  const gap = data ? data.gapShareBps / 100 : null
  const protocol = data ? data.protocolShareBps / 100 : null
  const contracts = [
    { k: 'The hook and the BSKT token', a: HOOK },
    { k: 'The router', a: ROUTER },
    { k: 'The market clock', a: CLOCK },
  ]
  return (
    <div className="grid items-start gap-4 lg:grid-cols-2">
      <Card>
        <h2 className="display text-[24px]">One hook runs six pools</h2>
        <div className="mx-auto mt-5 max-w-[520px]">
          <PoolDiagram />
        </div>
        <p className="label mt-4 text-[16px] leading-relaxed">
          Every pair of the four assets is its own Uniswap v4 pool, six in all, and all six point at one hook on Arc. The hook is the price curve: it keeps one shared reserve for the whole fund and prices each trade with Balancer's weighted maths, which with equal weights is x × y = k on the two balances being traded. A swap in any pool pays the same fund.
        </p>
      </Card>

      <Card>
        <h2 className="display text-[24px]">Each swap pays the larger of two fees</h2>
        <div className="mt-4">
          <Block title="The posted fee">
            {data ? `${fmtBps(data.openBps)} while Wall Street is open, ${fmtBps(data.closedBps)} while it is closed and ${fmtBps(data.staleBps)} if Chainlink's prices are stale. ${100 - (protocol ?? 0)}% stays in the fund and ${protocol}% goes to the protocol.` : PENDING}
          </Block>
          <Block title="The gap fee">
            {gap !== null ? `${gap}% of the trade's edge: what the trader receives, valued at Chainlink's reference price, minus what they paid. All of it stays in the fund.` : PENDING}
          </Block>
        </div>
        <p className="label mt-1 text-[16px] leading-relaxed">
          That is how the fund stops the first bot after Monday's open from taking the weekend gap. The bot keeps {gap !== null ? 100 - gap : '…'}% of its edge, so closing the gap is still its best trade, and holders get the rest.
        </p>
        <div className="mt-4 rounded-2xl bg-well p-4">
          <p className="label text-[15px]">
            <Pill tone="grey" className="mr-2 align-middle">
              <Dot /> Illustration, not live data
            </Pill>
            A $1M fund over a weekend, and Nvidia opens 5% higher on Monday.
          </p>
          <div className="mt-3 flex h-10 overflow-hidden rounded-xl text-[13px] font-bold" role="img" aria-label="The fund keeps $182 and the bot keeps $46">
            <div className="label flex items-center bg-accent px-3 text-white" style={{ width: '80%' }}>
              Fund $182
            </div>
            <div className="label flex flex-1 items-center justify-end bg-pink px-3 text-ink">Bot $46</div>
          </div>
          <p className="label mt-3 text-[14px] leading-relaxed text-ink-2">
            Trading the pool up to the new price is worth about $228 to the first bot. The gap fee keeps $182 of it for holders, and the bot keeps $46.
          </p>
        </div>
      </Card>

      <Card>
        <h2 className="display text-[24px]">Wall Street's clock, from Chainlink CRE</h2>
        <p className="label mt-3 text-[16px] leading-relaxed">
          A Chainlink CRE workflow writes Wall Street's reference prices, and whether the market is open, into a clock contract on Arc. The hook reads it on every trade to pick the posted fee and to measure each trade's edge.
        </p>
        <p className="label mt-4 text-[14px] leading-relaxed text-ink-2">
          tNVDA, tAAPL and tMSFT are testnet stand-ins with no value. Only the deployer can mint them, so you get them by buying with USDC. Not a registered fund or ETF.
        </p>
      </Card>

      <Card>
        <h2 className="display text-[24px]">Contracts on Arc testnet</h2>
        <ul className="label mt-3 divide-y divide-line border-t border-line">
          {contracts.map((c) => (
            <li key={c.a} className="flex items-center justify-between gap-3 py-3 text-[15px]">
              <span className="text-ink-2">{c.k}</span>
              <a href={addressUrl(c.a)} target="_blank" rel="noopener noreferrer" className="num font-semibold text-accent-ink underline underline-offset-2">
                {shortAddr(c.a)}
              </a>
            </li>
          ))}
        </ul>
        <p className="label mt-3 text-[14px] text-ink-2">Open any address on the Arc explorer to read the code that holds the money.</p>
      </Card>
    </div>
  )
}
