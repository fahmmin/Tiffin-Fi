import { Wallet } from 'lucide-react'
import { shortAddr } from './format'
import { Button } from './ui'
import { useWallet } from './wallet'

export function WalletButton() {
  const w = useWallet()
  if (w.account && w.wrongChain) {
    return (
      <Button onClick={() => void w.switchToArc()} loading={w.switching}>
        Switch to Arc testnet
      </Button>
    )
  }
  if (w.account) {
    return (
      <span
        className="label inline-flex min-h-11 items-center gap-2 rounded-full border border-lav-line bg-lav px-4 text-[14px] font-semibold text-accent-ink"
        title={w.account}
        aria-label={`Connected wallet ${w.account}`}
      >
        <span className="size-2 rounded-full bg-ok" aria-hidden="true" />
        {shortAddr(w.account)}
      </span>
    )
  }
  return (
    <Button onClick={() => void w.connect()} loading={w.connecting}>
      <Wallet className="size-4" aria-hidden="true" />
      Connect wallet
    </Button>
  )
}
