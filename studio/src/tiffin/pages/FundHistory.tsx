import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { ASSETS, assetByAddress } from '../config'
import { BarChart, ChartCard, ChartMessage, GapChart, LOADING, LineChart, type Pt } from '../charts'
import { fmtUsdNum, toNumber } from '../format'
import { loadSamples, loadSwaps, cachedSamples, cachedSwaps, type Sample, type SwapRow } from '../history'
import { valueUsd } from '../math'
import { PENDING } from '../ui'
import { useFund, type FundData } from '../useFund'

const HOURS = 48
const COULD_NOT_READ = "History can't be read from the RPC right now. The rest of the page is unaffected."

const sharePrice = (s: Sample) => Number(s.nav) / Number(s.supply)
const fmtShare = (n: number) => `$${n.toFixed(4)}`

function livePoint(d: FundData): Sample {
  return { block: d.block, time: d.blockTime, nav: d.nav, supply: d.supply, fees: d.totalFeesUsd, gap: d.gapCapturedUsd }
}

export function FundHistory() {
  const { data } = useFund()
  const latest = data?.block

  // a to c: samples read from past blocks, plus the newest point on every refresh.
  const [base, setBase] = useState<Sample[] | null>(() => (cachedSamples().length >= 2 ? cachedSamples() : null))
  const [failed, setFailed] = useState(false)
  const [extra, setExtra] = useState<Sample[]>([])

  useEffect(() => {
    if (latest === undefined || base || failed) return
    let live = true
    loadSamples(latest)
      .then((s) => live && setBase(s))
      .catch(() => live && setFailed(true))
    return () => {
      live = false
    }
  }, [latest, base, failed])

  useEffect(() => {
    if (!data) return
    const t = setTimeout(() => {
      setExtra((prev) => (prev.length > 0 && prev[prev.length - 1].block >= data.block ? prev : [...prev, livePoint(data)].slice(-240)))
    }, 0)
    return () => clearTimeout(t)
  }, [data])

  const samples = useMemo(() => {
    if (!base) return null
    const last = base[base.length - 1].block
    return [...base, ...extra.filter((e) => e.block > last)]
  }, [base, extra])

  // d: Swap events, read in chunks of at most 9,000 blocks, then added up per hour.
  const [swaps, setSwaps] = useState<SwapRow[] | null>(() => (cachedSwaps().length > 0 ? [...cachedSwaps()] : null))
  const [swapFailed, setSwapFailed] = useState(false)
  useEffect(() => {
    if (latest === undefined || swapFailed) return
    let live = true
    loadSwaps(latest)
      .then((rows) => live && setSwaps([...rows]))
      .catch(() => live && setSwapFailed(true))
    return () => {
      live = false
    }
  }, [latest, swapFailed])

  const lineSeries = (pick: (s: Sample) => number, name: string, color: string) => ({
    name,
    color,
    points: (samples ?? []).map((s): Pt => ({ t: s.time, v: pick(s) })),
  })

  const volume = useMemo(() => {
    if (!data || !swaps) return null
    const endHour = Math.floor(data.blockTime / 3600)
    const bars: Pt[] = Array.from({ length: HOURS }, (_, i) => ({ t: (endHour - (HOURS - 1) + i) * 3600, v: 0 }))
    for (const s of swaps) {
      const idx = Math.floor(s.time / 3600) - (endHour - (HOURS - 1))
      const asset = assetByAddress(s.assetIn)
      if (idx < 0 || idx >= HOURS || !asset) continue
      bars[idx].v += toNumber(valueUsd(asset.index, s.amountIn, data.refPrices), 18)
    }
    return { bars, last24: bars.slice(-24).reduce((sum, b) => sum + b.v, 0) }
  }, [data, swaps])

  const gaps = data
    ? ASSETS.filter((a) => a.index < 3).map((a) => {
        const pool = toNumber(data.poolPrices[a.index], 18)
        const ref = toNumber(data.refPrices[a.index], 18)
        return {
          name: a.symbol.replace(/^t/, ''),
          color: a.color,
          pct: ref > 0 ? ((pool - ref) / ref) * 100 : 0,
          detail: `Pool ${fmtUsdNum(pool)}, Chainlink ${fmtUsdNum(ref)}`,
        }
      })
    : null
  const widest = gaps ? gaps.reduce((m, g) => (Math.abs(g.pct) > Math.abs(m.pct) ? g : m), gaps[0]) : null

  const historyBody = (chart: () => ReactNode) => (failed ? <ChartMessage tone="bad">{COULD_NOT_READ}</ChartMessage> : samples ? chart() : LOADING)

  return (
    <section aria-labelledby="history-title" className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2 px-1">
        <h2 id="history-title" className="display text-[24px]">
          History
        </h2>
        <span className="label text-[13px] text-ink-2">Read from the hook on Arc. Hover or tap a chart for a value.</span>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <ChartCard title="One share's price" value={data ? fmtShare(Number(data.nav) / Number(data.supply || 1n)) : PENDING} note="Fund value divided by shares issued.">
          {historyBody(() => (
            <LineChart series={[lineSeries(sharePrice, 'Share price', '#6e54ff')]} fmt={fmtShare} label="One BSKT share's price over time" />
          ))}
        </ChartCard>

        <ChartCard title="Fund value" value={data ? fmtUsdNum(toNumber(data.nav, 18)) : PENDING} note="The reserve at Chainlink's prices at the time.">
          {historyBody(() => (
            <LineChart series={[lineSeries((s) => toNumber(s.nav, 18), 'Fund value', '#08718a')]} fmt={fmtUsdNum} label="Fund value over time" />
          ))}
        </ChartCard>

        <ChartCard
          title="Fees earned and gap captured"
          value={data ? `${fmtUsdNum(toNumber(data.totalFeesUsd, 18))} earned` : PENDING}
          note={data ? `${fmtUsdNum(toNumber(data.gapCapturedUsd, 18))} of it captured from bots.` : undefined}
        >
          {historyBody(() => (
            <LineChart
              includeZero
              series={[lineSeries((s) => toNumber(s.fees, 18), 'Fees earned', '#6e54ff'), lineSeries((s) => toNumber(s.gap, 18), 'Gap captured', '#ff8be0')]}
              fmt={fmtUsdNum}
              label="Fees earned and gap captured over time"
            />
          ))}
        </ChartCard>

        <ChartCard
          title="Swap volume per hour"
          value={volume ? `${fmtUsdNum(volume.last24)} in 24 hours` : swapFailed ? '–' : PENDING}
          note="Each swap valued at today's Chainlink prices."
        >
          {swapFailed ? (
            <ChartMessage tone="bad">{COULD_NOT_READ}</ChartMessage>
          ) : volume ? (
            <BarChart bars={volume.bars} fmt={fmtUsdNum} label="Swap volume per hour, last 48 hours" color="#6e54ff" unit="1 hour" />
          ) : (
            LOADING
          )}
        </ChartCard>

        <ChartCard
          className="md:col-span-2"
          title="Pool price against Chainlink"
          value={widest ? `${widest.name} ${widest.pct > 0 ? '+' : widest.pct < 0 ? '−' : ''}${Math.abs(widest.pct).toFixed(2)}%` : PENDING}
          note="How far each stock's pool price is from Chainlink's price right now. That gap is what the gap fee captures."
        >
          {gaps ? <GapChart rows={gaps} /> : LOADING}
        </ChartCard>
      </div>
    </section>
  )
}
