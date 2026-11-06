import {
	bytesToHex,
	consensusMedianAggregation,
	CronCapability,
	type CronPayload,
	EVMClient,
	getNetwork,
	handler,
	HTTPClient,
	type HTTPSendRequester,
	json,
	ok,
	prepareReportRequest,
	Runner,
	type Runtime,
	TxStatus,
} from '@chainlink/cre-sdk'
import { encodeAbiParameters, formatUnits, parseAbiParameters, parseUnits } from 'viem'

export type Config = {
	schedule: string
	/** Quote endpoint; `{symbol}` is replaced by each ticker. */
	quoteUrl: string
	/** Must match the order of MarketClock.stocks(): NVDA, AAPL, MSFT. */
	symbols: string[]
	chainName: string
	marketClock: string
	gasLimit: string
}

// Yahoo answers 429 to requests without a browser-like User-Agent.
const USER_AGENT =
	'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'

// NYSE full-day closures, as New York dates.
// shortcut: 1 pm early closes (2026-11-27, 2026-12-24, 2027-11-26) count as open all day, and the list stops at 2027; extend it before 2028.
const NYSE_HOLIDAYS = new Set([
	'2026-01-01', '2026-01-19', '2026-02-16', '2026-04-03', '2026-05-25',
	'2026-06-19', '2026-07-03', '2026-09-07', '2026-11-26', '2026-12-25',
	'2027-01-01', '2027-01-18', '2027-02-15', '2027-03-26', '2027-05-31',
	'2027-06-18', '2027-07-05', '2027-09-06', '2027-11-25', '2027-12-24',
])

const sundayOnOrAfter = (year: number, month: number, day: number) =>
	day + ((7 - new Date(Date.UTC(year, month, day)).getUTCDay()) % 7)

// NYSE regular session: Mon-Fri 9:30-16:00 America/New_York, minus holidays.
// An arrow, not a function declaration: Javy refuses to compile exported function declarations that take parameters.
export const isNyseOpen = (unixSeconds: number): boolean => {
	const t = unixSeconds * 1000
	const year = new Date(t).getUTCFullYear()
	// US daylight time runs from the second Sunday of March, 2:00 EST (07:00 UTC), to the first Sunday of
	// November, 2:00 EDT (06:00 UTC). Worked out by hand because QuickJS has no Intl time zones.
	const dst =
		t >= Date.UTC(year, 2, sundayOnOrAfter(year, 2, 8), 7) && t < Date.UTC(year, 10, sundayOnOrAfter(year, 10, 1), 6)
	const ny = new Date(t - (dst ? 4 : 5) * 3_600_000)
	const weekday = ny.getUTCDay()
	const minute = ny.getUTCHours() * 60 + ny.getUTCMinutes()
	return (
		weekday >= 1 &&
		weekday <= 5 &&
		!NYSE_HOLIDAYS.has(ny.toISOString().slice(0, 10)) &&
		minute >= 9 * 60 + 30 &&
		minute < 16 * 60
	)
}

type YahooChart = { chart?: { result?: { meta?: { regularMarketPrice?: unknown } }[] } }

/** Runs on every node; the DON agrees on the median. Returns USD x 1e18. */
const fetchPrice = (requester: HTTPSendRequester, url: string): bigint => {
	const res = requester.sendRequest({ url, multiHeaders: { 'User-Agent': { values: [USER_AGENT] } } }).result()
	if (!ok(res)) throw new Error(`HTTP ${res.statusCode} from ${url}`)
	const price = (json(res) as YahooChart).chart?.result?.[0]?.meta?.regularMarketPrice
	if (typeof price !== 'number' || !Number.isFinite(price) || price <= 0) throw new Error(`no price in ${url}`)
	return parseUnits(price.toString(), 18)
}

export const onCron = (runtime: Runtime<Config>, payload: CronPayload) => {
	const config = runtime.config
	// Every node sees the same scheduled time, so they all agree on marketOpen.
	const scheduled = payload.scheduledExecutionTime
	if (!scheduled) throw new Error('cron payload has no scheduledExecutionTime')
	const asOf = new Date(Number(scheduled.seconds) * 1000).toISOString()
	const marketOpen = isNyseOpen(Number(scheduled.seconds))

	const http = new HTTPClient()
	const prices = config.symbols.map((symbol) =>
		http
			.sendRequest(runtime, fetchPrice, consensusMedianAggregation<bigint>())(config.quoteUrl.replace('{symbol}', symbol))
			.result(),
	)
	const quotes = config.symbols.map((symbol, i) => `${symbol}=$${formatUnits(prices[i], 18)}`).join(' ')
	runtime.log(`${quotes} marketOpen=${marketOpen} asOf=${asOf}`)

	const network = getNetwork({ chainFamily: 'evm', chainSelectorName: config.chainName })
	if (!network) throw new Error(`unknown chain ${config.chainName}`)
	const encoded = encodeAbiParameters(parseAbiParameters('uint256[] prices, bool marketOpen'), [prices, marketOpen])
	const report = runtime.report(prepareReportRequest(encoded)).result()
	const reply = new EVMClient(network.chainSelector.selector)
		.writeReport(runtime, { receiver: config.marketClock, report, gasConfig: { gasLimit: config.gasLimit } })
		.result()
	if (reply.txStatus !== TxStatus.SUCCESS) throw new Error(`writeReport failed: ${reply.errorMessage ?? reply.txStatus}`)

	// A dry run (no --broadcast) sends nothing, so there is no hash.
	const txHash = reply.txHash?.length ? bytesToHex(reply.txHash) : 'none (dry run)'
	runtime.log(`wrote report ${encoded} to MarketClock ${config.marketClock} on ${config.chainName}, tx ${txHash}`)

	return { prices: prices.map(String), marketOpen, asOf, txHash }
}

export const initWorkflow = (config: Config) => [
	handler(new CronCapability().trigger({ schedule: config.schedule }), onCron),
]

export async function main() {
	const runner = await Runner.newRunner<Config>()
	await runner.run(initWorkflow)
}
