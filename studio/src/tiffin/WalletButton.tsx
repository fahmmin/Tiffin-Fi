import { Wallet } from 'lucide-react'
import { shortAddr } from './format'
import { Button } from './ui'
import { useWallet } from './wallet'

export function WalletButton({ compact = false }: { compact?: boolean }) {
  const w = useWallet()
  if (w.account && w.wrongChain) {
    return (
      <Button onClick={() => void w.switchToArc()} loading={w.switching} className={compact ? '!px-4 !py-2 text-sm' : ''}>
        Switch to Arc testnet
      </Button>
    )
  }
  if (w.account) {
    return (
      <span
        className="label inline-flex min-h-11 items-center gap-2 rounded-full border border-[#d9d5f5] bg-lav px-4 text-sm font-medium text-accent-dark"
        title={w.account}
      >
        <span className="size-2 rounded-full bg-[#1FA45B]" aria-hidden="true" />
        {shortAddr(w.account)}
      </span>
    )
  }
  return (
    <Button onClick={() => void w.connect()} loading={w.connecting} className={compact ? '!px-4 !py-2 text-sm' : ''}>
      <Wallet className="size-4" aria-hidden="true" />
      Connect wallet
    </Button>
  )
}
