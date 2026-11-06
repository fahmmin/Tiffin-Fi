// Builds docs/tldraw/architecture.tldr, the whiteboard the landing page shows (exported to app/public/architecture.svg),
// and app/src/board.ts, where each box sits, so the page can ring the part each step is about.
// Open the .tldr in tldraw.com: menu, File, Open. Records are checked against tldraw's schema before writing.
// Run from this folder: npm install && node build-board.mjs
import fs from 'node:fs'
import { createBindingId, createShapeId, createTLSchema, toRichText } from '@tldraw/tlschema'
import { getIndexAbove } from '@tldraw/utils'

const schema = createTLSchema()
const PAGE = 'page:page'
const shapes = []
const bindings = []
const boxes = {}

const base = (type, x, y, props) => ({
  id: createShapeId(), typeName: 'shape', type, x, y, rotation: 0, index: 'a1',
  parentId: PAGE, isLocked: false, opacity: 1, meta: {}, props,
})

function box(name, x, y, w, h, text, { color = 'black', fill = 'semi', geo = 'rectangle', size = 'm', dash = 'draw' } = {}) {
  const s = base('geo', x, y, {
    geo, dash, url: '', w, h, growY: 0, scale: 1, flipX: false, flipY: false, labelColor: 'black',
    color, fill, size, font: 'draw', align: 'middle', verticalAlign: 'middle', richText: toRichText(text),
  })
  shapes.push(s)
  if (name) boxes[name] = { x, y, w, h }
  return s
}

function text(x, y, value, { size = 's', color = 'grey', w = 480 } = {}) {
  shapes.push(base('text', x, y, { color, size, font: 'draw', textAlign: 'start', w, richText: toRichText(value), scale: 1, autoSize: false }))
}

const center = (s) => ({ x: s.x + s.props.w / 2, y: s.y + s.props.h / 2 })

/** An arrow bound to both boxes, so it follows them when moved on stage. */
function arrow(from, to, label = '', { color = 'black', dash = 'draw', bend = 0 } = {}) {
  const a = center(from), b = center(to)
  const s = base('arrow', a.x, a.y, {
    kind: 'arc', labelColor: 'black', color, fill: 'none', dash, size: 'm', arrowheadStart: 'none', arrowheadEnd: 'arrow',
    font: 'draw', start: { x: 0, y: 0 }, end: { x: b.x - a.x, y: b.y - a.y }, bend, richText: toRichText(label),
    labelPosition: 0.5, scale: 1, elbowMidPoint: 0.5,
  })
  shapes.push(s)
  for (const [terminal, target] of [['start', from], ['end', to]]) {
    bindings.push({
      id: createBindingId(), typeName: 'binding', type: 'arrow', fromId: s.id, toId: target.id, meta: {},
      props: { terminal, normalizedAnchor: { x: 0.5, y: 0.5 }, isExact: false, isPrecise: false, snap: 'none' },
    })
  }
}

/** A numbered sticker for each step of the landing page's walkthrough. */
const badge = (n, x, y) => box(null, x, y, 64, 64, String(n), { geo: 'ellipse', color: 'orange', fill: 'solid', size: 'l' })

// Arc: everything on chain sits inside this frame. Drawn first so it paints behind.
box('arc', 460, 200, 1140, 840, '', { color: 'grey', fill: 'none', dash: 'dashed' })
text(490, 214, 'Arc testnet: gas in USDC, final in under a second', { w: 480 })

// Off chain, top row: where the prices come from. Gaps of 200 leave room for the arrow labels.
const wallst = box('wallst', 0, 0, 300, 150, 'Wall Street\nNVDA  AAPL  MSFT', { geo: 'ellipse', color: 'grey', fill: 'none' })
const cre = box('cre', 500, 0, 420, 150, 'Chainlink CRE\nnodes fetch prices,\nmedian + NYSE hours', { color: 'blue' })
arrow(wallst, cre, 'quotes', { color: 'grey' })

// On Arc.
const clock = box('clock', 1120, 330, 440, 150, 'MarketClock\nprice per stock,\nmarket open or closed', { color: 'blue', fill: 'solid' })
arrow(cre, clock, 'signed report', { color: 'blue' })

const trader = box('trader', 0, 560, 300, 220, 'Trader\nswaps USDC\nfor NVDA', { geo: 'ellipse', color: 'black', fill: 'none' })
const pools = box('pools', 500, 560, 420, 220, '6 Uniswap v4 pools\none per pair of\nNVDA AAPL MSFT USDC', { color: 'violet' })
const hook = box('hook', 1120, 560, 440, 220, 'BasketHook\nbeforeSwap: Balancer maths\nfee: 0.30% or 80% of edge\nreturns BeforeSwapDelta', { color: 'violet', fill: 'solid' })
arrow(trader, pools, 'swap')
arrow(pools, hook, 'beforeSwap', { color: 'violet' })
arrow(clock, hook, 'price + open?', { color: 'blue' })

const holders = box('holders', 500, 860, 420, 150, 'Holders get BSKT\na share of the reserve,\nfees stay inside', { color: 'green', fill: 'none' })
const reserve = box('reserve', 1120, 860, 440, 150, 'Shared reserve\nERC-6909 claims\n25% each of 4 assets', { color: 'green' })
arrow(hook, reserve, 'takes in, pays out', { color: 'violet' })
arrow(holders, reserve, 'claim on', { color: 'green' })

// Steps, in the order the landing page walks them.
badge(1, 460, -36)
badge(2, 236, 540)
badge(3, 1080, 524)
badge(4, 1080, 294)
badge(5, 460, 524)
badge(6, 1080, 824)

// ---------- assemble ----------
let index = getIndexAbove() // paint order follows creation order
for (const s of shapes) { s.index = index; index = getIndexAbove(index) }
const document = { id: 'document:document', typeName: 'document', gridSize: 10, name: 'Tiffin Fi architecture', meta: {} }
const page = { id: PAGE, typeName: 'page', name: 'Architecture', index: 'a1', meta: {} }
const records = [document, page, ...shapes, ...bindings]
for (const r of records) schema.types[r.typeName].validate(r) // throws on any field tldraw wouldn't accept

const file = { tldrawFileFormatVersion: 1, schema: schema.serialize(), records }
fs.writeFileSync(new URL('./architecture.tldr', import.meta.url), JSON.stringify(file, null, 2))
fs.writeFileSync(
  new URL('../../app/src/board.ts', import.meta.url),
  `// Generated by docs/tldraw/build-board.mjs: where each box sits on the tldraw board, in its page units.\nexport const BOARD = ${JSON.stringify(boxes, null, 2)} as const\n`,
)
console.log(`wrote architecture.tldr: ${shapes.length} shapes, ${bindings.length} bindings, all valid; board.ts: ${Object.keys(boxes).length} boxes`)
