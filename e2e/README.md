# End-to-end and stress tests

These tests drive the Tiffin Fi app in a real browser on Arc testnet. Every confirmed step is a real transaction
from a throwaway test wallet.

## Run

```bash
npm install
npm run wallet
```

`npm run wallet` creates a throwaway wallet and saves it to `e2e/.env.e2e`, which git ignores. Only its address is
printed.

```bash
npm run fund
```

`npm run fund` sends 1.5 Arc USDC and a few test shares from the deployer. It needs `PRIVATE_KEY` in your shell.

```bash
npm test
```

Playwright builds the app, serves it on `http://localhost:4188` and runs `tests/stress.spec.ts`.

## What `stress.spec.ts` covers

The wallet in `tests/wallet.ts` is injected into the page. To the app it behaves like MetaMask: it shows no accounts
until the site connects, starts on Ethereum without Arc so the app has to add Arc, emits `chainChanged`, and can
cancel a request. It signs and sends real transactions in Node with the test key.

- Connecting adds Arc to the wallet and switches to it, then the live balances and the fund load.
- Bad amounts (`0`, `abc`, `0.1.2`, `-1`, `1e3`, more than the balance) can't be sent.
- A cancelled approval shows "You cancelled the request in your wallet." and the form recovers.
- Buying BSKT with USDC, then selling it back.
- A double click sends one transaction, not two.
- USDC to a stock, and one stock to another.
- Stress: ten back-to-back swaps, then the activity feed lists the wallet.
- Leaving a pending trade for another screen and coming back.
- The wallet leaving Arc: the app asks to switch back.

## Synpress with real MetaMask

`tests/metamask.spec.ts` runs the same flows through the real MetaMask UI with
[Synpress](https://github.com/Synthetixio/synpress) 4.1.2 and MetaMask 13.13.1. Synpress doesn't support native
Windows. `scripts/allow-windows.mjs` lifts its platform check and fixes three path bugs, which is enough to build the
MetaMask cache (`npm run cache`). The tests themselves still fail on Windows: copying the cached browser profile hits
`EBUSY` on files Windows keeps locked, so MetaMask starts un-onboarded. The suite therefore skips itself on Windows.
Run it on Linux, macOS or WSL.
