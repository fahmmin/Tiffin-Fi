# MarketClock CRE workflow

A Chainlink CRE workflow that tells the basket hook what Wall Street is doing. Every 5 minutes it:

1. fetches the NVDA, AAPL and MSFT prices from Yahoo's chart API (`chart.result[0].meta.regularMarketPrice`) with the HTTP capability; each node fetches and the DON takes the median;
2. works out from the trigger's scheduled time whether NYSE regular hours are open (Mon-Fri 9:30-16:00 New York time, US daylight saving, the 2026-2027 NYSE holidays);
3. signs a report `abi.encode(uint256[] prices, bool marketOpen)`, prices in USD x 1e18 in the order [NVDA, AAPL, MSFT];
4. writes it to [MarketClock](../src/MarketClock.sol) `0x11e65932196B07617180A8Fc5D1885BFd1170e9F` on Arc testnet (chain name `arc-testnet`) and logs the prices, the market status, the report bytes and the tx hash.

MarketClock accepts reports from two forwarders, both from the [CRE forwarder directory](https://docs.chain.link/cre/guides/workflow/using-evm-client/forwarder-directory-ts): `0x6E9EE680ef59ef64Aa8C7371279c27E496b5eDc1` (the mock forwarder `cre workflow simulate --broadcast` goes through) and `0x76c9cf548b4179F8901cda1f8623568b58215E62` (the live forwarder for deployed workflows).

## Setup

You need [Bun](https://bun.com) 1.2.21 or later and the CRE CLI.

```powershell
# Windows (PowerShell). The CLI goes to %LOCALAPPDATA%\Programs\cre and onto your user PATH; open a new terminal after.
irm https://app.chain.link/cre/install.ps1 | iex
```

```bash
# macOS / Linux
curl -sSL https://app.chain.link/cre/install.sh | bash
```

Simulating needs a free Chainlink account ([create one](https://app.chain.link)) and a logged-in CLI:

```bash
cre login     # opens the browser; check with: cre whoami
```

Then install the workflow's dependencies and run its unit tests:

```bash
cd cre/market-clock
bun install
bun test
```

## Simulate

Run from `cre/`. `--non-interactive --trigger-index 0` fires the cron trigger straight away instead of waiting for the next 5-minute tick.

```bash
# Dry run: real Yahoo quotes and a real report, the write is only simulated (eth_call), no key needed
cre workflow simulate market-clock --non-interactive --trigger-index 0 --target staging-settings

# Broadcast: sends a real transaction on Arc testnet through the mock forwarder
cp .env.example .env    # then put your key in CRE_ETH_PRIVATE_KEY
cre workflow simulate market-clock --non-interactive --trigger-index 0 --target staging-settings --broadcast
```

A broadcast simulation on 6 Nov 2026 wrote NVDA $188.005, AAPL $343.65, MSFT $535.015 and `marketOpen=true` to
MarketClock: [tx 0x7074…c996](https://explorer.testnet.arc.io/tx/0x70746a4373566f8a305357b89f8a1a513e252b235917725120e59a1a94aac996),
with MarketClock's `ReportApplied` event from the simulation forwarder in the receipt.

The broadcast log ends with `tx 0x...`; open it at `https://explorer.testnet.arc.io/tx/<hash>`. The forwarder catches a reverting receiver, so a mined transaction alone does not prove MarketClock took the report: look for its `ReportApplied` event, or read `marketOpen()` and `priceOf(stock)`.

## Environment

| Variable | When | What |
| --- | --- | --- |
| `CRE_ETH_PRIVATE_KEY` | `--broadcast` only | Private key of an account with Arc testnet USDC for gas, 64 hex chars. Put it in `cre/.env` (git-ignored) or export it; never commit it. |
| `CRE_API_KEY` | optional | Replaces `cre login` in CI. Needs deploy access (`cre account access`). |
| `CRE_TARGET` | optional | Same as `--target`. |

The workflow has no secrets: Yahoo needs no API key. Settings live in `project.yaml` (Arc RPC) and `market-clock/config.json` (schedule, quote URL, symbols, MarketClock address, gas limit).
