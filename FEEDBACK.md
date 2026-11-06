# Feedback for Uniswap

We built a custom-curve v4 hook on Arc testnet: one hook serves six pools (every pair of NVDA, AAPL, MSFT and
USDC) from one shared reserve held as ERC-6909 claims, priced with Balancer's weighted maths, with a fee that
reads a Chainlink market clock. Notes from building it in about a day.

## What worked well

- **Return deltas make a custom curve small.** `beforeSwap` takes the input as claims (`mint`), pays the output
  from claims (`burn`), and returns `toBeforeSwapDelta(amountIn, -amountOut)`. v4's own maths then swaps zero.
  The whole curve is a few dozen lines.
- **ERC-6909 claims are per token, not per pool.** That made a reserve shared by six pools natural: the hook
  holds one USDC claim balance and every pool draws on it.
- **The test utilities.** `Deployers`, `PoolSwapTest` and `deployCodeTo` to a flagged address gave us a full
  local test suite against a real PoolManager in minutes.
- **v4 was already on Arc testnet.** We used the deployed PoolManager directly; no core deployment needed.

## Where we lost time

- **BaseHook.** The v4-periphery version that `forge install uniswap/v4-periphery` fetched today has no
  `BaseHook`, while many guides and templates still import it. We implemented `IHooks` directly. A note in the
  periphery README pointing to where it moved would save people a search.
- **BeforeSwapDelta signs.** Working out how `specified` and `unspecified` map to currency0 and currency1, and
  who owes what afterwards, took a careful read of `Hooks.sol`. A small table in the docs (exact-in and exact-out,
  zeroForOne and oneForZero, with the resulting hook delta and caller delta) would help a lot.
- **Exact output on custom curves.** We reject exact-output swaps because they need the inverse curve. A template
  that shows both directions for a custom curve would make it easier to support everything routers send.
- **slot0 on custom-curve pools.** The pool's own price is meaningless here (we initialise at 1:1), but explorers
  and UIs still read it. A convention or flag for "this pool is priced by its hook" would avoid confusion.
- **Quoting.** It wasn't obvious from the docs whether the routing API will quote a hook-priced pool. The v4
  Quoter runs the real swap path, hook included, so it should price these pools, but a short note on how routers
  treat custom curves would help hook authors plan. We added a `quote()` view on the hook for our own app.
- **Docs URLs.** `docs.uniswap.org` pages redirected to `developers.uniswap.org` and then to an `llms.mdx`
  path while we were reading the custom accounting guide, which broke a couple of tools we used to fetch docs.
- **HookMiner** lives under `test/shared` in v4-periphery. Importing it from a deploy script works but feels
  unintended; a supported location would be nicer.

## Arc-specific note for v4 builders

Arc's USDC (`0x3600…0000`) checks a blocklist precompile on every transfer. Foundry's local simulation can't run
that precompile, so any `forge script` that moves USDC fails before broadcasting. We deployed with Forge and
sent USDC transactions with viem. Worth a line in any "deploy a v4 hook on Arc" guide.
