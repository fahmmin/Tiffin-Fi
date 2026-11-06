import { describe, expect } from 'bun:test'
import type { CronPayload } from '@chainlink/cre-sdk'
import { EvmMock, HttpActionsMock, newTestRuntime, REPORT_METADATA_HEADER_LENGTH, test } from '@chainlink/cre-sdk/test'
import { bytesToHex, decodeAbiParameters, parseAbiParameters } from 'viem'
import config from './config.json'
import { type Config, isNyseOpen, onCron } from './main'

const at = (iso: string) => Date.parse(iso) / 1000
const cron = (iso: string) => ({ scheduledExecutionTime: { seconds: BigInt(at(iso)), nanos: 0 } }) as CronPayload
const ARC_TESTNET = 3034092155422581607n

describe('isNyseOpen', () => {
	test('9:30-16:00 New York in winter time (UTC-5)', () => {
		expect(isNyseOpen(at('2026-11-06T14:29:59Z'))).toBe(false)
		expect(isNyseOpen(at('2026-11-06T14:30:00Z'))).toBe(true)
		expect(isNyseOpen(at('2026-11-06T20:59:59Z'))).toBe(true)
		expect(isNyseOpen(at('2026-11-06T21:00:00Z'))).toBe(false)
	})

	test('9:30-16:00 New York in summer time (UTC-4)', () => {
		expect(isNyseOpen(at('2026-07-06T13:29:59Z'))).toBe(false)
		expect(isNyseOpen(at('2026-07-06T13:30:00Z'))).toBe(true)
		expect(isNyseOpen(at('2026-07-06T19:59:59Z'))).toBe(true)
		expect(isNyseOpen(at('2026-07-06T20:00:00Z'))).toBe(false)
	})

	test('switches on the US DST dates', () => {
		// 2026: daylight time from Sun Mar 8 to Sun Nov 1. 13:30 UTC is 8:30 EST but 9:30 EDT.
		expect(isNyseOpen(at('2026-03-06T13:30:00Z'))).toBe(false)
		expect(isNyseOpen(at('2026-03-09T13:30:00Z'))).toBe(true)
		expect(isNyseOpen(at('2026-10-30T13:30:00Z'))).toBe(true)
		expect(isNyseOpen(at('2026-11-02T13:30:00Z'))).toBe(false)
		// 2027: daylight time from Sun Mar 14 to Sun Nov 7.
		expect(isNyseOpen(at('2027-03-12T13:30:00Z'))).toBe(false)
		expect(isNyseOpen(at('2027-03-15T13:30:00Z'))).toBe(true)
		expect(isNyseOpen(at('2027-11-05T13:30:00Z'))).toBe(true)
		expect(isNyseOpen(at('2027-11-08T13:30:00Z'))).toBe(false)
	})

	test('closed on weekends and NYSE holidays', () => {
		expect(isNyseOpen(at('2026-11-07T16:00:00Z'))).toBe(false) // Saturday
		expect(isNyseOpen(at('2026-11-08T16:00:00Z'))).toBe(false) // Sunday
		expect(isNyseOpen(at('2026-11-26T16:00:00Z'))).toBe(false) // Thanksgiving
		expect(isNyseOpen(at('2027-03-26T16:00:00Z'))).toBe(false) // Good Friday
		expect(isNyseOpen(at('2027-07-05T16:00:00Z'))).toBe(false) // Independence Day, observed
		expect(isNyseOpen(at('2027-12-24T16:00:00Z'))).toBe(false) // Christmas, observed
		expect(isNyseOpen(at('2026-11-27T16:00:00Z'))).toBe(true) // day after Thanksgiving trades
	})
})

describe('onCron', () => {
	const quotes: Record<string, number> = { NVDA: 188.28, AAPL: 344.31, MSFT: 535.895 }

	test('fetches the three prices and writes abi.encode(uint256[] prices, bool marketOpen) to MarketClock', () => {
		const requested: string[] = []
		HttpActionsMock.testInstance().sendRequest = (req) => {
			requested.push(req.url)
			expect(req.multiHeaders['User-Agent']?.values[0]).toStartWith('Mozilla/5.0')
			const symbol = req.url.split('/chart/')[1].split('?')[0]
			const body = { chart: { result: [{ meta: { regularMarketPrice: quotes[symbol] } }] } }
			return { statusCode: 200, body: Buffer.from(JSON.stringify(body)).toString('base64') }
		}
		let written: { receiver: string; payload: `0x${string}`; gasLimit: bigint } | undefined
		EvmMock.testInstance(ARC_TESTNET).writeReport = (req) => {
			written = {
				receiver: bytesToHex(req.receiver),
				payload: bytesToHex(req.report!.rawReport.slice(REPORT_METADATA_HEADER_LENGTH)),
				gasLimit: req.gasConfig!.gasLimit,
			}
			return { txStatus: 'TX_STATUS_SUCCESS', txHash: Buffer.alloc(32, 0xab).toString('base64') }
		}
		const runtime = newTestRuntime<Config>()
		runtime.config = config

		const result = onCron(runtime, cron('2026-11-06T16:45:00Z'))

		expect(requested).toEqual(config.symbols.map((s) => config.quoteUrl.replace('{symbol}', s)))
		expect(written?.receiver).toBe(config.marketClock.toLowerCase())
		expect(written?.gasLimit).toBe(500000n)
		const [prices, marketOpen] = decodeAbiParameters(
			parseAbiParameters('uint256[] prices, bool marketOpen'),
			written!.payload,
		)
		expect(prices).toEqual([188280000000000000000n, 344310000000000000000n, 535895000000000000000n])
		expect(marketOpen).toBe(true)
		expect(result.txHash).toBe(`0x${'ab'.repeat(32)}`)
		const logs = runtime.getLogs().join('\n')
		expect(logs).toContain('NVDA=$188.28 AAPL=$344.31 MSFT=$535.895 marketOpen=true')
		expect(logs).toContain(`tx 0x${'ab'.repeat(32)}`)
	})

	test('reports marketOpen=false outside regular hours', () => {
		HttpActionsMock.testInstance().sendRequest = () => ({
			statusCode: 200,
			body: Buffer.from(JSON.stringify({ chart: { result: [{ meta: { regularMarketPrice: 100 } }] } })).toString('base64'),
		})
		let payload: `0x${string}` | undefined
		EvmMock.testInstance(ARC_TESTNET).writeReport = (req) => {
			payload = bytesToHex(req.report!.rawReport.slice(REPORT_METADATA_HEADER_LENGTH))
			return { txStatus: 'TX_STATUS_SUCCESS' }
		}
		const runtime = newTestRuntime<Config>()
		runtime.config = config

		const result = onCron(runtime, cron('2026-11-07T16:45:00Z')) // Saturday

		const [, marketOpen] = decodeAbiParameters(parseAbiParameters('uint256[] prices, bool marketOpen'), payload!)
		expect(marketOpen).toBe(false)
		expect(result.txHash).toBe('none (dry run)')
	})

	test('fails without writing when a quote request fails', () => {
		HttpActionsMock.testInstance().sendRequest = () => ({ statusCode: 429, body: '' })
		let wrote = false
		EvmMock.testInstance(ARC_TESTNET).writeReport = () => {
			wrote = true
			return { txStatus: 'TX_STATUS_SUCCESS' }
		}
		const runtime = newTestRuntime<Config>()
		runtime.config = config

		expect(() => onCron(runtime, cron('2026-11-06T16:45:00Z'))).toThrow()
		expect(wrote).toBe(false)
	})
})
