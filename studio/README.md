# Tiffin Fi, built in Arc Studio

This folder is the Arc Studio build of Tiffin Fi, pulled from
[the Arc Studio project](https://studio.arc.io/app/fdcb28e0-c08d-4981-9c0d-9a7ae25774d0) with `arc-studio pull`.
Arc Studio wrote, tested and deployed these contracts from a plain description of the app.

- `contracts/MockStock.sol`: test shares (tNVDA, tAAPL, tMSFT); only the owner can mint.
- `contracts/MarketClock.sol`: Chainlink CRE receiver. It stores reference prices and market hours, accepts
  allowlisted forwarders, and can pin the expected workflow owner.
- `contracts/BasketHook.sol`: the Uniswap v4 custom-curve hook and the BSKT token.
  - Six pools share one reserve of ERC-6909 claims.
  - Pricing is Balancer's equal-weight maths, which is x*y=k per pair.
  - Each swap pays the larger of the posted fee or 80% of the edge at the reference price.
  - It also handles joins and exits.
- `contracts/BasketRouter.sol`: an exact-input router.
- `contracts/BasketBootstrap.sol`: deploys the hook at its flag address through the CREATE2 deployer and opens the six
  pools, in one constructor.
- `contracts/test/`: 114 Foundry tests, including fuzz and invariant runs.

Deployed addresses are in [`../deployments/arc-testnet-studio.json`](../deployments/arc-testnet-studio.json).
`node scripts/studio.mjs verify`, run from the repo root, checks them on chain.

To run the tests here, install the libraries the remappings point at, then run Foundry:

```bash
forge install uniswap/v4-periphery OpenZeppelin/openzeppelin-contracts --no-git
```

```bash
forge test
```
