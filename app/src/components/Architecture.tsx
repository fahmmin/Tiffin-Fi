import { useState } from 'react'
import { Basket, Hub, Relay } from '@lucasmarkes/hairline/react'
import { BOARD } from '../board.ts'

type Part = keyof typeof BOARD

// The exported drawing's own viewBox (docs/tldraw: re-export the SVG and update this if the board moves),
// so the overlay's rings land on the drawing's boxes at any width.
const VIEWBOX = { x: -24, y: -60, w: 1648, h: 1124 }
const PAD = 18

const STEPS: { title: string; partner: string; parts: Part[]; Figure: typeof Hub; body: string }[] = [
  {
    title: 'Chainlink checks Wall Street',
    partner: 'Chainlink CRE',
    parts: ['wallst', 'cre'],
    Figure: Relay,
    body: 'Every five minutes a CRE workflow runs on many Chainlink nodes. Each fetches Nvidia, Apple and Microsoft; they agree on the median, work out NYSE hours and sign one report to MarketClock on Arc.',
  },
  {
    title: 'A trader swaps',
    partner: 'Uniswap v4',
    parts: ['trader', 'pools'],
    Figure: Hub,
    body: 'A bot sends USDC to the Nvidia/USDC pool. It is one of six v4 pools, one per pair of the four assets, and all six point at the same hook.',
  },
  {
    title: 'The hook prices it',
    partner: 'Uniswap v4',
    parts: ['hook'],
    Figure: Hub,
    body: "In beforeSwap the hook prices the trade with Balancer's weighted maths over the shared reserve. The pool still says Friday's $188 for Nvidia.",
  },
  {
    title: 'The hook checks the clock',
    partner: 'Chainlink CRE',
    parts: ['clock', 'hook'],
    Figure: Relay,
    body: "MarketClock says Wall Street is open and Nvidia is $197, so the bot is getting a $9-a-share bargain. 80% of that beats the 0.30% fee, so the gap fee applies.",
  },
  {
    title: 'Arc settles it',
    partner: 'Arc',
    parts: ['arc'],
    Figure: Hub,
    body: "The hook returns a BeforeSwapDelta, so Uniswap's own curve swaps nothing. Arc settles the trade in USDC, final in under a second.",
  },
  {
    title: 'The fund keeps the fee',
    partner: 'The fund',
    parts: ['reserve', 'holders'],
    Figure: Basket,
    body: 'The fee stays in the shared reserve, held as ERC-6909 claims. Same number of BSKT, a bigger reserve, so every share redeems for more.',
  },
]

const PARTS = Object.keys(BOARD) as Part[]

export function Architecture() {
  const [step, setStep] = useState(0)
  const current = step > 0 ? STEPS[step - 1] : undefined
  const lit = new Set<Part>(current?.parts ?? [])
  const Figure = current?.Figure ?? Hub
  const last = step === STEPS.length

  return (
    <section className="lp-dark lp-arch" id="architecture" aria-labelledby="arch-title">
      <span className="chip is-dark">Under the hood</span>
      <h2 id="arch-title">One swap, start to finish.</h2>
      <p className="lp-arch-lede">
        Monday, 9:30 in New York. The pool still shows Friday's price for Nvidia. Walk the trade through every part.
      </p>

      <div className="lp-arch-grid">
        <figure className="lp-arch-board">
          <div className="lp-arch-scroll">
            <div className="lp-arch-canvas">
              <img
                src="/architecture.svg"
                width={VIEWBOX.w}
                height={VIEWBOX.h}
                alt="Wall Street quotes go to a Chainlink CRE workflow, which writes a signed report to MarketClock on Arc. A trader swaps in one of six Uniswap v4 pools; their hook prices the trade with Balancer's maths, reads the clock for the fee, and pays out of one shared reserve that holders own through BSKT."
              />
              <svg viewBox={`${VIEWBOX.x} ${VIEWBOX.y} ${VIEWBOX.w} ${VIEWBOX.h}`} className="lp-arch-overlay" aria-hidden="true">
                <defs>
                  <mask id="arch-spot">
                    <rect x={VIEWBOX.x} y={VIEWBOX.y} width={VIEWBOX.w} height={VIEWBOX.h} fill="white" />
                    {PARTS.map((p) => {
                      const b = BOARD[p]
                      return (
                        <rect key={p} className={`lp-arch-hole${lit.has(p) ? ' is-on' : ''}`} x={b.x - PAD} y={b.y - PAD} width={b.w + 2 * PAD} height={b.h + 2 * PAD} rx="28" fill="black" />
                      )
                    })}
                  </mask>
                </defs>
                <rect className={`lp-arch-dim${current ? ' is-on' : ''}`} x={VIEWBOX.x} y={VIEWBOX.y} width={VIEWBOX.w} height={VIEWBOX.h} mask="url(#arch-spot)" />
                {PARTS.map((p) => {
                  const b = BOARD[p]
                  return (
                    <rect key={p} className={`lp-arch-ring${lit.has(p) ? ' is-on' : ''}`} x={b.x - PAD} y={b.y - PAD} width={b.w + 2 * PAD} height={b.h + 2 * PAD} rx="28" />
                  )
                })}
              </svg>
            </div>
          </div>
          <figcaption>
            Drawn in tldraw. The numbers match the steps.{' '}
            <a href="/architecture.tldr" download>
              Download the board
            </a>{' '}
            and open it at tldraw.com.
          </figcaption>
        </figure>

        <div className="lp-arch-card">
          <div className="lp-arch-fig">
            <Figure play intensity={0.6} theme="dark" label={current ? `Animated figure for: ${current.title}` : 'A hub whose links light up'} className="hairline-fig" />
          </div>
          <div aria-live="polite">
            {current ? (
              <>
                <p className="lp-arch-meta">
                  <span className="num-badge">{step}</span>
                  <span>of {STEPS.length}</span>
                  <span className="chip is-dark">{current.partner}</span>
                </p>
                <h3>{current.title}</h3>
                <p>{current.body}</p>
              </>
            ) : (
              <>
                <p className="lp-arch-meta">
                  <span className="chip is-dark">6 steps</span>
                </p>
                <h3>Follow one Monday trade</h3>
                <p>Press Start, and each step lights up the parts it uses: Chainlink CRE, Uniswap v4, Arc and the fund.</p>
              </>
            )}
          </div>
          <div className="lp-arch-nav">
            <button type="button" className="lp-arch-btn" onClick={() => setStep(step - 1)} disabled={step === 0}>
              Back
            </button>
            <span className="lp-arch-dots">
              {STEPS.map((s, i) => (
                <button
                  key={s.title}
                  type="button"
                  aria-label={`Step ${i + 1}: ${s.title}`}
                  aria-current={step === i + 1 ? 'step' : undefined}
                  onClick={() => setStep(i + 1)}
                />
              ))}
            </span>
            <button type="button" className="lp-arch-btn is-primary" onClick={() => setStep(last ? 0 : step + 1)}>
              {step === 0 ? 'Start' : last ? 'Restart' : 'Next'}
            </button>
          </div>
        </div>
      </div>
    </section>
  )
}
