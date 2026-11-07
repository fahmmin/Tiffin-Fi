# Tiffin Fi design spec

This spec describes the look of the Tiffin Fi web app. The reference build is our prototype at
https://tiffinfi.vercel.app. Screenshots of every screen are in `screens/`:

- `landing-desktop.jpg` is the whole landing page.
- `landing-section-NN.jpg` shows each landing section on its own, in order.
- `<screen>-desktop.jpg` is each app screen at 1440 px wide, and `<screen>-phone.jpg` is the same screen at 390 px.

The Arc Studio app should match this look. Rebuild the UI from this spec; don't copy code from anywhere.

## What must not change

The visual pass changes how things look. Don't change contracts, addresses or how trades are built and sent. Our
end-to-end tests drive the trade forms through these names, so keep each one exactly:

- The trade form sits in a `tabpanel` under a tablist named "Trade type", with tabs Buy, Sell and Swap.
- Inputs `#amt-you-pay` and `#amt-you-sell`.
- Comboboxes "Token you pay" and "Token you receive", with options labelled USDC, tNVDA, tAAPL and tMSFT.
- Buttons:
  - Connect wallet
  - Switch to Arc testnet
  - Approve USDC
  - Buy the basket
  - Sell for USDC
  - Swap USDC for tNVDA, and the same pattern for other pairs
- Status messages, with `role="status"`:
  - USDC approved. Now buy.
  - Bought. Confirmed on Arc testnet
  - Confirmed on Arc testnet
  - USDC approved. Now swap.
  - Swapped. Confirmed on Arc testnet
- The text "You cancelled the request in your wallet." when a wallet request is rejected.
- The connected address is shown after connecting.
- A bad amount (0, letters, negative, more than allowed) disables the form's last button.

## Data, loading and errors

- **RPCs.** Arc's own RPC (`https://rpc.testnet.arc.io`) rate-limits contract reads on busy shared networks, such as
  a hackathon venue's WiFi. Read through viem's `fallback` transport over these, in this order:
  1. `https://rpc.drpc.testnet.arc.io`
  2. `https://rpc.blockdaemon.testnet.arc.io`
  3. `https://rpc.testnet.arc.io`

  Give each one `retryCount: 1`. Use the same list, in the same order, as `rpcUrls` when the app adds Arc to a wallet.
- **Before the first read** returns, show `…` in place of a number. Never show `$0.00`, `0%` or "stale" for data
  that hasn't loaded.
- **When a read fails,** keep the last good values on screen and show this banner in the bad-soft colour:
  "Cannot reach Arc testnet right now. Retrying every 15 seconds."
- Poll every 15 seconds, and only while the page is visible.

## Tokens

### Colour

| Token | Hex | Use |
|---|---|---|
| white | `#ffffff` | cards |
| ground | `#f5f5f6` | page background, light panels |
| grey | `#efefef` | hero panel, grey cards |
| grey-2 | `#f4f4f6` | input wells, chips |
| line | `#e6e6ea` | hairlines, card borders |
| ink | `#0d0d10` | text, active nav item |
| ink-2 | `#63666e` | secondary text |
| ink-3 | `#b9bbc3` | placeholders, empty values |
| accent | `#6e54ff` | primary buttons, key numbers, NVDA |
| accent-hover | `#5b41f2` | |
| accent-ink | `#5a3fe6` | accent text on light |
| accent-on-dark | `#9583ff` | accent text on deep panels |
| lavender | `#ece8ff` | testnet banner, soft highlights |
| lavender-2 | `#ddd7fe` | |
| lavender-line | `#d8d0ff` | banner border |
| deep | `#0d0a1a` | dark panels, USDC |
| deep-2 | `#1b1630` | cards on dark panels |
| on-deep | `#ffffff` | text on dark |
| on-deep-2 | `#b9b2db` | secondary text on dark |
| pink | `#ff8be0` | MSFT, highlights |
| cyan | `#7de3fa` | AAPL, highlights |
| ok / ok-soft | `#08718a` / `#e4f7fc` | live and success |
| warn / warn-soft | `#8a5300` / `#fff1de` | pool away from Chainlink, notices |
| bad / bad-soft | `#a3156f` / `#ffe8f7` | errors |

The four assets always use the same colours: NVDA accent, AAPL cyan, MSFT pink, USDC deep. The "What the fund holds"
bar and the dots in the hero pill use them.

### Type

| Role | Family | Weights |
|---|---|---|
| Display | Switzer (Fontshare) | 500, 600, 700 |
| Body | Stack Sans Headline (Google Fonts) | 400, 700 |
| Labels and small UI text | Geist (Google Fonts) | 500, 600, 700 |

```html
<link rel="stylesheet" href="https://api.fontshare.com/v2/css?f[]=switzer@500,600,700&display=swap" />
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Geist:wght@500;600;700&family=Stack+Sans+Headline:wght@400;700&display=swap" />
```

| Text | Size | Letter spacing | Line height |
|---|---|---|---|
| Hero title | `clamp(2.5rem, 7.2vw, 6.2rem)` | `-0.05em` | about 0.95 |
| Section titles | `clamp(2.2rem, 4.8vw, 3.6rem)` | `-0.04em` | about 1 |
| Big statements | `clamp(2.1rem, 3.8vw, 3.3rem)` | `-0.04em` | |
| Big numbers | `clamp(2.4rem, 5.6vw, 4.6rem)` | `-0.04em` | |
| App page title | 28px, display | | |
| Body | 15–18px | | |
| Labels, chips | 13–14px, Geist | | |

Display text is tight and heavy. Body text is plain and never all caps.

### Shape and depth

- **Radii:**
  - pills and buttons 999px;
  - landing panels 32px;
  - cards 24px;
  - wells and inner cards 14–16px;
  - inputs 12–14px.
- **Shadows** are rare:
  - cards use `0 1px 2px rgba(13,13,16,.08), 0 0 0 1px #e6e6ea`;
  - the primary call to action has a glow, `0 12px 30px rgba(110,84,255,.32)`.
- **Landing layout:** each section is a full-width rounded panel inset about 8px from the viewport edges, with about
  8px between panels. Light and deep panels alternate. Content is at most about 1100px wide inside a 1408px frame.

## Components

- **Testnet banner:**
  - a lavender strip with a lavender-line border and 999px radius, at the very top of every page;
  - text: "Arc testnet. The stock tokens are test tokens; the prices are real and the fund settles in Arc USDC."
- **Landing nav:**
  - left: the logo mark and "Tiffin Fi";
  - centre: section links Architecture, How it works, Why it pays, Proof, Live fund, Roadmap;
  - right: the "Open app" call to action.
  - It sticks to the top on a translucent ground.
- **Calls to action:**
  - **Primary:** an accent pill with white text and a white circle holding an up-right arrow on its right side. It has the glow shadow.
  - **Outline:** a white pill with a line border.
  - **On dark panels:** a white pill with ink text.
- **Chip:** a small rounded label, Geist 13px, on grey-2 with a dot either side. The dark variant uses deep-2 and
  on-deep-2.
- **Number badge:** "01", "02" in a small rounded square. Use these only where the content really is a sequence.
- **Inline highlight tags** in the hero subtitle are rounded backgrounds behind words:
  - white for "Nvidia, Apple, Microsoft";
  - pink for "USDC";
  - lavender for "its fees";
  - deep with white text for "Monday's gap pay the fund."
- **Line figures:** the two cards that explain the fund (sections 2 and 3 below) each show an animated isometric line
  figure from the npm package `@lucasmarkes/hairline`, version 0.5.1 (MIT, no dependencies; React is an optional peer).
  - Import the components from `@lucasmarkes/hairline/react` and render them as
    `<Figure play intensity={0.6} theme="dark" label="…" />`. `play` makes the figure walk through its own loop.
  - A figure fills its parent's width at a 5:4 ratio. Show it at most 260px wide, centred at the top of the card.
  - Colour it with custom properties on the card. `--hairline-plate` must be the card's colour right behind the figure,
    because the figure's plates are filled. On the walkthrough card: plate = the card background, `--hairline-hi: #ffffff`,
    `--hairline-edge: #b9b2db`, `--hairline-mid: #4a4270`, `--hairline-lo: #241d42`, `--hairline-stroke: 1`. On the parts
    card: plate = the card background behind the figure, `--hairline-hi: #ffffff`, `--hairline-edge: #c9c2ec`,
    `--hairline-mid: #5a4f8f`, `--hairline-lo: #2a2160`, `--hairline-stroke: 1`.
  - When the card's content changes, its figure changes with it.
  - Under `prefers-reduced-motion` the package rests the figure by itself. Add no other motion.
  - References: `walk-step-0.jpg` to `walk-step-6.jpg` (the walkthrough card before Start and at each step) and
    `parts-card-1.jpg` to `parts-card-4.jpg` (the parts card for each item). A screenshot is one moment of the loop.

## Landing page, top to bottom

Copy is final unless a number here comes from live data.

1. **Hero** (`landing-section-01.jpg`)
   - Panel: grey, centred.
   - Chips: "Built on Arc", "A Uniswap v4 hook".
   - Title: "What if your index fund [pill] paid you instead of charging you?". The pill is a dark rounded capsule
     holding the logo mark and four dots in the asset colours.
   - Subtitle: "The basket keeps Nvidia, Apple, Microsoft and USDC in one token. Traders pay its fees, and a Chainlink
     clock makes Monday's gap pay the fund."
   - Buttons: primary "Open app" to `#fund`, outline "See the Monday gap" to `#compare`.
2. **Why it exists, and the four parts** (`landing-section-02.jpg`, deep panel)
   - **Top, "Why this exists" chip and statement:** "Tokenized stocks trade all weekend while Wall Street is shut. On
     Monday the first bot to close the gap takes what the pool's holders lost." The words after "takes" are in
     accent-on-dark.
   - **Left, "Four parts, one fund" chip and title:** the title is "What makes the fund pay you?". Below it is an
     accordion of four items with number badges; one is open at a time.
   - **Right, a deep-2 card for the open item:** a figure, then the item's name, a big stat and a caption. The hook
     shows the six-pool diagram. The other three show a line figure (see "Line figures"): The shared reserve `Vault`,
     The market clock `Relay`, The fund token `Basket`.

   | Item | Body | Stat (live where possible) |
   |---|---|---|
   | The hook | A custom curve in beforeSwap. Uniswap v4's own maths swaps nothing; the hook prices every trade with Balancer's weighted formula. | "1", "hook prices all six pools". Show the six-pool diagram: four asset nodes around the hook. |
   | The shared reserve | The fund's balances, held as ERC-6909 claims in the v4 PoolManager. Every pair of the four assets is a pool, and all six trade against this one reserve. | Fund value, "in the reserve right now, at Chainlink's prices" |
   | The market clock | A Chainlink CRE workflow writes Wall Street's prices and hours into a clock contract on Arc. The hook reads it on every swap to set the fee and measure the edge. | Posted fee now, "posted fee right now, with Wall Street open/closed" |
   | The fund token | BSKT is your share of the reserve. Buy it with USDC and sell it for USDC. Fees stay in the reserve, so each share redeems for more. | Share price, "for one BSKT right now" |
3. **One swap, start to finish** (`landing-section-03.jpg`, deep panel, `id="architecture"`)
   - **Chip and title:** chip "Under the hood"; title "One swap, start to finish."
   - **Lede:** "Monday, 9:30 in New York. The pool still shows Friday's price for Nvidia. Walk the trade through every part."
   - **Left, a diagram of the system, drawn as an inline SVG:**
     - Wall Street: NVDA, AAPL, MSFT.
     - Chainlink CRE: nodes fetch prices, the median plus NYSE hours.
     - MarketClock: a price per stock, and whether the market is open or closed.
     - Trader: swaps USDC for NVDA.
     - Six Uniswap v4 pools: one per pair of NVDA, AAPL, MSFT and USDC.
     - BasketHook: beforeSwap with Balancer maths; the fee is 0.30% or 80% of the edge; it returns a BeforeSwapDelta.
     - Shared reserve: ERC-6909 claims, 25% each of 4 assets.
     - Holders: they get BSKT, a share of the reserve, and fees stay inside.

     Draw the six parts inside Arc in a dashed frame labelled "Arc testnet: gas in USDC, final in under a second". Label
     the arrows: quotes, signed report, price + open?, swap, beforeSwap, takes in, pays out, claim on.
   - **Right, a card titled "Follow one Monday trade":**
     - a line figure at the top (see "Line figures") that changes with the step: `Hub` before Start, then `Relay`,
       `Hub`, `Hub`, `Relay`, `Hub` and `Basket` for steps 1 to 6;
     - a "6 steps" chip;
     - the body "Press Start, and each step lights up the parts it uses: Chainlink CRE, Uniswap v4, Arc and the fund.";
     - Back and Start (then Next) buttons, with six progress dots.

     Each step highlights its parts in the diagram and dims the rest. The steps:

     | Step | Partner | Parts lit | Body |
     |---|---|---|---|
     | 1. Chainlink checks Wall Street | Chainlink CRE | Wall Street, CRE | A CRE workflow runs on many Chainlink nodes. Each fetches Nvidia, Apple and Microsoft; they agree on the median, work out NYSE hours and sign one report to MarketClock on Arc. |
     | 2. A trader swaps | Uniswap v4 | trader, pools | A bot sends USDC to the Nvidia/USDC pool. It is one of six v4 pools, one per pair of the four assets, and all six point at the same hook. |
     | 3. The hook prices it | Uniswap v4 | hook | In beforeSwap the hook prices the trade with Balancer's weighted maths over the shared reserve. The pool still says Friday's $188 for Nvidia. |
     | 4. The hook checks the clock | Chainlink CRE | clock, hook | MarketClock says Wall Street is open and Nvidia is $197, so the bot is getting a $9-a-share bargain. 80% of that beats the 0.30% fee, so the gap fee applies. |
     | 5. Arc settles it | Arc | Arc | The hook returns a BeforeSwapDelta, so Uniswap's own curve swaps nothing. Arc settles the trade in USDC, final in under a second. |
     | 6. The fund keeps the fee | The fund | reserve, holders | The fee stays in the shared reserve, held as ERC-6909 claims. Same number of BSKT, a bigger reserve, so every share redeems for more. |
4. **Same stocks. The gap pays you.** (`landing-section-04.jpg`, deep panel, `id="compare"`)
   - **Chip and title:** chip "Why use a basket"; title "Same stocks. The gap pays you.", with the second sentence in
     accent-on-dark.
   - **Two lists with a round "vs" badge between them:**
     - "A plain fund or pool", with crosses:
       - Charges you to rebalance
       - Quotes Friday's price all weekend
       - The first bot keeps Monday's gap
       - Fees go to a manager
     - "This basket", with the logo mark and checks, highlighted in accent:
       - Traders pay it to rebalance
       - Knows Wall Street's hours through Chainlink
       - Keeps 80% of the gap for holders
       - Fees stay in the fund
   - **Two outcome cards with a thin bar each.** Mark them with an "Illustration" chip, since they show a worked example:
     - Pink bar, full width: "The bot's edge on a 5% Monday gap in Nvidia, on a $1M fund", **$228**, "Before any fee.
       A plain pool lets the bot keep nearly all of it."
     - Cyan bar at 20%: "What the bot keeps from this basket", **$46**, "The fund keeps $182, 80% of the edge, for its holders."
5. **The fund right now** (`landing-section-05.jpg`, `id="live"`). Two cards side by side:
   - **Left, a white card:**
     - title "The fund right now" and an "Arc testnet" live pill;
     - four figures: Fund value ("at Chainlink's prices"), One share ("of BSKT"), Fees earned ("for holders") and Gap
       captured ("from bots");
     - a fine print line: "Read live from the hook and the market clock on Arc testnet, block #n."
   - **Right, a deep card:**
     - a grid of 21 small dots, one lit per swap so far;
     - "Open" or "Closed" in large type, with "Wall Street, per Chainlink CRE. Swaps pay 0.30% now.";
     - "n swaps so far, one dot each. Every one paid the fund."
6. **Tested on chain, not on slides.** (`landing-section-06.jpg`, `id="proof"`)
   - **Heading:** title "Tested on chain, not on slides."; subtitle "Facts from our build, each with its source."
   - **A bento grid of tiles, each fact about this deployment:**
     - **Cyan tile:** "Gap captured", the live gap captured from bots, "80% of each bot's edge stays in the fund", with a
       link to the hook on the explorer.
     - **Grey tile:** "Contract tests". Show the number of Foundry tests in this workspace (unit, fuzz and invariant) and a
       row of small squares, one per test.
     - **Wide deep tile, left half:** "Chainlink CRE", with "Report on chain". The body is "A CRE workflow run fetched
       live quotes, reached consensus and wrote the report to MarketClock through the CRE forwarder." Add a white
       "View the transaction" call to action to
       https://explorer.testnet.arc.io/tx/0x11efa416c2514360c666bf0ff0641bf21ec07e5be9cf2a3f3a30cf0277a898bd.
     - **Wide deep tile, right half:** "Checked on chain", a big **19**, and "facts re-checked against the chain: the
       hook's address flags, owners, assets, both CRE forwarders and all six pools."
7. **Built with** (`landing-section-07.jpg`): one row reading "Built with", then the names Arc, Arc Studio,
   Uniswap v4, Chainlink CRE, Foundry and viem, set as quiet wordmarks.
8. **The numbers** (`landing-section-08.jpg`). Four big figures in a row:

   | Figure | Caption |
   |---|---|
   | **59%** | of Robinhood Chain stock-token DEX volume traded outside regular US hours, 24 Sep to 23 Oct 2026. Source link "Crypto Briefing": https://cryptobriefing.com/robinhood-chain-stock-tokens-after-hours-trading/ |
   | **$20.9B** | of tokenized-stock DEX volume in the 30 days to 28 Sep, about 60% of it on Uniswap. Source link "Crypto Briefing": https://cryptobriefing.com/uniswap-tokenized-stock-deposits-defi/ |
   | **6** with a small "pools" | trade against 1 reserve in this fund, one per pair of the four assets. |
   | **80%** | of the gap kept for holders, read from the hook on Arc. |
9. **How the basket works.** (`landing-section-09.jpg`, `id="steps"`). Two cards:
   - **Left, a grey card:**
     - title "How the basket works."; subtitle "The same loop on every trading day, and over every weekend.";
     - an "Illustration" chip with "On a $1M fund, a 5% Monday gap in Nvidia is worth about $228 to bots. The fund keeps $182.";
     - a big "3" with "steps, and you only do the first."
   - **Right, a deep card** headed "3 steps", with a numbered list. The middle step is highlighted in accent:
     1. **Buy the basket with USDC.** One token holds Nvidia, Apple, Microsoft and USDC, a quarter each.
     2. **Traders swap against it and pay fees.** Every swap pays at least the posted fee, and the fees stay in the fund.
     3. **Chainlink keeps the clock, so Monday's gap pays the fund.** When Wall Street reopens, the gap fee keeps 80% of
        the first bot's edge.
10. **Where the basket goes next.** (`landing-section-10.jpg`, `id="roadmap"`)
    - **Chip and title:** chip "After the hackathon"; title "Where the basket goes next."
    - **Four columns with number badges.** The first badge is in accent.

    | Item | Body |
    |---|---|
    | Real tokenized stocks | Swap the test tokens for real ones, such as xStocks or Ondo, in the same reserve. |
    | Chainlink 24/7 prices | Round-the-clock equity prices, so the fund can price the weekend and not only Monday's open. |
    | More baskets and weights | Other sets of stocks and unequal weights, priced with the same weighted maths. |
    | A capped mainnet launch | A deposit cap while the contracts earn trust, after an audit. |
11. **Footer** (`landing-section-11.jpg`, deep panel)
    - **Top row:** on the left, "Your index fund, paid to rebalance." with a white "Open app" call to action; on the
      right, app links Fund, Trade, Activity and How it works.
    - **Wordmark:** a giant "Tiffin Fi" across the full width, with the "T" in accent.
    - **Disclaimer:** "Tiffin Fi is hackathon software built at ETHGlobal Mumbai. The contracts are unaudited and the
      stock tokens are test tokens. Not investment advice, and not a registered fund or ETF. Nvidia, Apple, Microsoft,
      Uniswap, Chainlink and Arc are their owners' names."

## App screens

All four app screens share one shell (see `fund-desktop.jpg`).

- **Sidebar**, 248px wide, white with a line border on the right:
  - top: the logo and "Tiffin Fi", with the tagline "A stock basket that gets paid to rebalance";
  - nav: Fund, Trade, Activity and How it works, each with a line icon. The active item is an ink pill with white
    text, radius 12px;
  - bottom: a grey-2 network card ("Arc testnet", "Block n", "Wall Street open/closed, per Chainlink CRE") with a
    status dot in ok, then an "About the basket" link to the landing page.
- **Top bar:**
  - left: a small "Tiffin Fi" label over the page title;
  - right: a network pill ("Arc testnet · chain 5042002 #block" with a dot) and the "Connect wallet" button, or the
    connected address.
- **Below the top bar:** the testnet banner, then the page content, max about 1130px wide.
- **Footer line:** "Every number comes from a contract read on Arc testnet, refreshed every 15 seconds."

The screens:

- **Fund** (`fund-desktop.jpg`):
  - **Header card:** "Stock Basket (BSKT)" with an "Arc testnet" pill, the line "Nvidia, Apple, Microsoft and USDC, a
    quarter each, in one token. Traders pay it to swap.", and three figures: One share is worth (in accent), Fund
    value and Shares issued.
  - **"Wall Street's clock" card:**
    - an open/closed pill;
    - New York and Mumbai times;
    - "Posted fee on every swap" as three tiles: Market open 0.30%, Market closed 0.60% and Prices stale 2.00%. The
      current state is filled in accent;
    - "Chainlink CRE updated Wall Street's prices n minutes ago."
  - **"What traders have paid" card:** fees earned for holders in big accent type, then rows for Gap captured from
    bots, Protocol share and Swaps.
  - **"What the fund holds" card:**
    - a segmented bar in the four asset colours;
    - one row per asset: a dot, the name, the amount, "Pool $x, Chainlink $y" and a warn pill such as "Pool 1.07%
      above" when they differ;
    - the value and weight on the right.
- **Trade** (`trade-desktop.jpg`). Two columns:
  - **Left, the form card:**
    - a segmented control on a grey-2 track; the active tab is white;
    - a "You pay" well on grey-2, with a large number input and a token chip;
    - a hairline-bordered details list (You get, Worth, Fee);
    - a full-width accent button, 52px tall with radius 14px.
  - **Right, an explainer card** that follows the tab: "How buying works", "How selling works" or "How swapping
    works", with accent bullets.
- **Activity** (`activity-desktop.jpg`): the latest swaps, buys and sells as rows with the type, amounts, fee and an
  explorer link. Your own rows are marked once a wallet is connected.
- **How it works** (`how-desktop.jpg`): the long explanation page, with the same card and type styles.

## Phone

At 390px (`*-phone.jpg`):

- The landing sections stack in one column with 16px gutters.
- In the app, a bottom tab bar fixed to the screen edge replaces the sidebar. It has Fund, Trade, Activity and How,
  each an icon over a label; the active one is in accent.
- The top bar stacks:
  1. the page title;
  2. the network pill;
  3. the wallet button.
- Forms take the full width, and the explainer card moves below the form.

Nothing scrolls sideways.
