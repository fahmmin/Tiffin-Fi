// Arc Studio's deployment of Tiffin Fi: verify it on chain, push real prices, seed the fund and run one swap.
//   node scripts/studio.mjs verify   read-only checks of everything Studio reported
//   node scripts/studio.mjs seed     verify, push prices, seed with SEED_USDC (default 2) and swap 0.1 USDC
import { writeFileSync } from 'node:fs'
import { encodeAbiParameters, formatUnits, getAddress, parseAbi, parseUnits } from 'viem'
import { explorerTx, publicClient, walletClient } from './arc.mjs'
import { nyseOpen } from './nyse.mjs'

const OWNER = '0xcdaDd0E1aAE3A62ED588F66C33B4694aB9603cd2'
const POOL_MANAGER = '0x8366a39CC670B4001A1121B8F6A443A643e40951'
const FORWARDERS = ['0x76c9cf548b4179F8901cda1f8623568b58215E62', '0x6E9EE680ef59ef64Aa8C7371279c27E496b5eDc1']
const FLAGS = 0x2888n // beforeInitialize | beforeAddLiquidity | beforeSwap | beforeSwapReturnDelta
// As reported by Arc Studio's deploy turn; every one is checked below before use.
const s = {
  nvda: '0xe99e06837468301ec7fab24e7092aefccda8dc50',
  aapl: '0x846073a79a94e1c64c946855ec4f8d59ef5ba325',
  msft: '0x4925d2907dbfd3801aee4165a0214df330b5cba6',
  usdc: '0x3600000000000000000000000000000000000000',
  clock: '0x25610623501dfa7e73d5309ce7e31058bb487809',
  router: '0x34666e4b2b5022071c8205474ee8e252812bfd74',
  bootstrap: '0x51aa0273fc2e426b7c2487256c5211e0bf98b11f',
  hook: '0x4ff4fb09A5934aa98e5740465A5535fb25c6e888',
}
const ASSETS = [s.nvda, s.aapl, s.msft, s.usdc]
const SYMBOLS = ['NVDA', 'AAPL', 'MSFT', 'USDC']

const ownable = parseAbi(['function owner() view returns (address)'])
const tokenAbi = parseAbi([
  'function mint(address to, uint256 amount)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function balanceOf(address) view returns (uint256)',
])
const clockAbi = parseAbi([
  'function stocks(uint256) view returns (address)',
  'function isForwarder(address) view returns (bool)',
  'function pushReport(bytes report)',
  'function state() view returns (uint256[3] prices, uint256[3] priceTimes, bool open, uint256 marketTime)',
])
const hookAbi = parseAbi([
  'struct PoolKey { address currency0; address currency1; uint24 fee; int24 tickSpacing; address hooks; }',
  'struct Quote { uint256 amountOut; uint256 feeOut; uint256 protocolFee; uint256 feeUsd; uint256 edgeUsd; uint256 gapFee; bool fresh; }',
  'function assets() view returns (address[4])',
  'function poolKey(address a, address b) view returns (PoolKey)',
  'function totalSupply() view returns (uint256)',
  'function navUsd() view returns (uint256 nav, bool fresh)',
  'function sharePriceUsd() view returns (uint256)',
  'function quote(address assetIn, address assetOut, uint256 amountIn) view returns (Quote)',
  'function join(uint256[4] maxAmountsIn, uint256 minShares) returns (uint256)',
])
const bootstrapAbi = parseAbi(['function hook() view returns (address)'])
const pmAbi = parseAbi([
  'struct PoolKey { address currency0; address currency1; uint24 fee; int24 tickSpacing; address hooks; }',
  'function initialize(PoolKey key, uint160 sqrtPriceX96) returns (int24)',
  'error PoolAlreadyInitialized()',
])
const routerAbi = parseAbi([
  'struct PoolKey { address currency0; address currency1; uint24 fee; int24 tickSpacing; address hooks; }',
  'function swapExactInput(PoolKey key, bool zeroForOne, uint256 amountIn, uint256 minAmountOut, address recipient) returns (uint256)',
])

const read = (address, abi, functionName, args = []) => publicClient.readContract({ address, abi, functionName, args })
const same = (a, b) => getAddress(a) === getAddress(b)
let failures = 0
const check = (ok, what) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`)
  if (!ok) failures++
}

async function verify() {
  const hook = await read(s.bootstrap, bootstrapAbi, 'hook')
  check(same(hook, s.hook), `bootstrap deployed the hook at ${hook}`)
  check((BigInt(hook) & 0x3fffn) === FLAGS, `hook address flags 0x${(BigInt(hook) & 0x3fffn).toString(16)}`)
  for (const [name, address] of [['MarketClock', s.clock], ['BasketHook', s.hook], ['tNVDA', s.nvda], ['tAAPL', s.aapl], ['tMSFT', s.msft]]) {
    check(same(await read(address, ownable, 'owner'), OWNER), `${name} owner is the team address`)
  }
  const assets = await read(s.hook, hookAbi, 'assets')
  check(assets.every((a, i) => same(a, ASSETS[i])), 'hook assets are tNVDA, tAAPL, tMSFT, USDC')
  for (let i = 0; i < 3; i++) check(same(await read(s.clock, clockAbi, 'stocks', [BigInt(i)]), ASSETS[i]), `clock stock ${i} is ${SYMBOLS[i]}`)
  for (const f of FORWARDERS) check(await read(s.clock, clockAbi, 'isForwarder', [f]), `clock accepts CRE forwarder ${f}`)
  for (let a = 0; a < 4; a++) {
    for (let b = a + 1; b < 4; b++) {
      const key = await read(s.hook, hookAbi, 'poolKey', [ASSETS[a], ASSETS[b]])
      let initialised = false
      try {
        await publicClient.simulateContract({ address: POOL_MANAGER, abi: pmAbi, functionName: 'initialize', args: [key, 2n ** 96n] })
      } catch (e) {
        initialised = e.walk?.((x) => x?.data?.errorName === 'PoolAlreadyInitialized') !== null && String(e).includes('PoolAlreadyInitialized')
      }
      check(initialised && same(key.hooks, s.hook), `pool ${SYMBOLS[a]}/${SYMBOLS[b]} is initialised with the hook`)
    }
  }
}

async function price(symbol) {
  const res = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1m&range=1d`, { headers: { 'User-Agent': 'Mozilla/5.0' } })
  return BigInt(Math.round((await res.json()).chart.result[0].meta.regularMarketPrice * 1e6)) * 10n ** 12n
}

async function seed() {
  const wallet = walletClient()
  const send = async (address, abi, functionName, args) => {
    const hash = await wallet.writeContract({ address, abi, functionName, args })
    const receipt = await publicClient.waitForTransactionReceipt({ hash })
    if (receipt.status !== 'success') throw new Error(`${functionName} reverted: ${explorerTx(hash)}`)
    return hash
  }
  const prices = [await price('NVDA'), await price('AAPL'), await price('MSFT')]
  const report = encodeAbiParameters([{ type: 'uint256[]' }, { type: 'bool' }], [prices, nyseOpen()])
  console.log(`prices pushed: ${explorerTx(await send(s.clock, clockAbi, 'pushReport', [report]))}`)

  if ((await read(s.hook, hookAbi, 'totalSupply')) === 0n) {
    const usdc = parseUnits(process.env.SEED_USDC ?? '2', 6)
    const amounts = prices.map((p) => (usdc * 10n ** 12n * 10n ** 18n) / p)
    for (let i = 0; i < 3; i++) await send(ASSETS[i], tokenAbi, 'mint', [OWNER, amounts[i]])
    for (const token of ASSETS) {
      await send(token, tokenAbi, 'approve', [s.hook, 2n ** 256n - 1n])
      await send(token, tokenAbi, 'approve', [s.router, 2n ** 256n - 1n])
    }
    console.log(`seeded: ${explorerTx(await send(s.hook, hookAbi, 'join', [[...amounts, usdc], 0n]))}`)
  }
  const [nav, fresh] = await read(s.hook, hookAbi, 'navUsd')
  console.log(`fund value $${formatUnits(nav, 18)} (prices fresh: ${fresh}), share price $${formatUnits(await read(s.hook, hookAbi, 'sharePriceUsd'), 18)}`)

  const amountIn = parseUnits('0.1', 6)
  const q = await read(s.hook, hookAbi, 'quote', [s.usdc, s.aapl, amountIn])
  const key = await read(s.hook, hookAbi, 'poolKey', [s.usdc, s.aapl])
  const hash = await send(s.router, routerAbi, 'swapExactInput', [key, same(key.currency0, s.usdc), amountIn, (q.amountOut * 995n) / 1000n, OWNER])
  console.log(`swap 0.1 USDC -> ${formatUnits(q.amountOut, 18)} tAAPL through Studio's router: ${explorerTx(hash)}`)

  writeFileSync(new URL('../deployments/arc-testnet-studio.json', import.meta.url), `${JSON.stringify({ chainId: 5042002, builtIn: 'Arc Studio', poolManager: POOL_MANAGER, ...s }, null, 2)}\n`)
}

/// Trades each stock/USDC pool back to the clock's reference price, as arbitrage bots would (testnet has none).
async function rebalance() {
  const wallet = walletClient()
  const send = async (address, abi, functionName, args) => {
    const hash = await wallet.writeContract({ address, abi, functionName, args })
    const receipt = await publicClient.waitForTransactionReceipt({ hash })
    if (receipt.status !== 'success') throw new Error(`${functionName} reverted: ${explorerTx(hash)}`)
    await new Promise((r) => setTimeout(r, 3_000)) // stay under the public RPC's rate limit
    return hash
  }
  const poolAbi = parseAbi([
    'function poolPriceUsd(address asset) view returns (uint256)',
    'function reserves() view returns (uint256[4])',
  ])
  const isqrt = (n) => {
    if (n < 2n) return n
    let x = n
    let y = (x + 1n) / 2n
    while (y < x) [x, y] = [y, (y + n / y) / 2n]
    return x
  }
  const [prices] = await read(s.clock, clockAbi, 'state')
  for (let round = 0; round < 4; round++) {
    let moved = false
    for (let i = 0; i < 3; i++) {
      const pool = await read(s.hook, poolAbi, 'poolPriceUsd', [ASSETS[i]])
      const target = prices[i]
      if (Number(pool > target ? pool - target : target - pool) / Number(target) < 0.003) continue
      const r = await read(s.hook, poolAbi, 'reserves')
      const k = r[3] * r[i]
      const buying = target > pool
      const amountIn = buying ? isqrt((k * target) / 10n ** 30n) - r[3] : isqrt((k * 10n ** 30n) / target) - r[i]
      if (!buying) await send(ASSETS[i], tokenAbi, 'mint', [OWNER, amountIn])
      const [tokenIn, tokenOut] = buying ? [s.usdc, ASSETS[i]] : [ASSETS[i], s.usdc]
      const key = await read(s.hook, hookAbi, 'poolKey', [tokenIn, tokenOut])
      const hash = await send(s.router, routerAbi, 'swapExactInput', [key, same(key.currency0, tokenIn), amountIn, 0n, OWNER])
      console.log(`${SYMBOLS[i]} pool $${formatUnits(pool, 18)} -> Chainlink $${formatUnits(target, 18)}: ${explorerTx(hash)}`)
      moved = true
    }
    if (!moved) break
  }
  for (let i = 0; i < 3; i++) {
    const pool = await read(s.hook, poolAbi, 'poolPriceUsd', [ASSETS[i]])
    console.log(`  ${SYMBOLS[i]} pool $${Number(formatUnits(pool, 18)).toFixed(2)} vs Chainlink $${Number(formatUnits(prices[i], 18)).toFixed(2)}`)
  }
}

await verify()
if (failures) {
  console.log(`${failures} check(s) failed; not seeding.`)
  process.exit(1)
}
if (process.argv[2] === 'seed') await seed()
if (process.argv[2] === 'rebalance') await rebalance()
