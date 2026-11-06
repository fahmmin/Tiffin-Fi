import { useCallback, useRef, useState } from 'react'
import { BaseError, ContractFunctionRevertedError, decodeErrorResult, type Abi, type Address, type Hex } from 'viem'
import { publicClient } from './chain'
import { CHAIN_ID, hookAbi } from './config'
import { useFund } from './useFund'
import { isUserRejection, useWallet } from './wallet'

const NAMED: Record<string, string> = {
  StalePrices: "Chainlink's prices are stale right now, so single-asset trades are paused. Try again after the next price update.",
  ExceedsSingleAssetCap: 'That is more than 30% of the fund in one asset. Try a smaller amount.',
  Slippage: 'The price moved past your 0.5% limit. Refresh the preview and try again.',
  InvalidAmount: 'That amount is too small or invalid.',
  EmptyReserve: 'The fund has nothing of that asset to trade against yet.',
  InvalidAsset: 'That asset is not part of the basket.',
  ExactOutputNotSupported: 'This fund only supports exact-input trades.',
  PlainLiquidityDisabled: 'Liquidity can only be added by joining the fund.',
  SeedOwnerOnly: 'Only the team can make the first deposit.',
}

function named(name: string): string {
  return NAMED[name] ?? 'The transaction would fail on-chain. Check your balance and the amount, then try again.'
}

export function parseTxError(e: unknown): string {
  if (isUserRejection(e)) return 'You cancelled the request in your wallet.'
  if (e instanceof BaseError) {
    const reverted = e.walk((x) => x instanceof ContractFunctionRevertedError) as ContractFunctionRevertedError | null
    if (reverted) {
      const name = reverted.data?.errorName
      if (name === 'WrappedError') {
        const reason = (reverted.data?.args)?.[2] as Hex | undefined
        if (reason) {
          try {
            return named(decodeErrorResult({ abi: hookAbi, data: reason }).errorName)
          } catch {
            /* fall through */
          }
        }
        return 'The pool rejected this trade. Try a smaller amount.'
      }
      if (name) return named(name)
      const raw = reverted.raw
      if (raw && raw !== '0x') {
        try {
          return named(decodeErrorResult({ abi: hookAbi, data: raw }).errorName)
        } catch {
          /* fall through */
        }
      }
    }
  }
  const msg = ((e as Error)?.message ?? '').toLowerCase()
  if (msg.includes('insufficient funds') || msg.includes('exceeds the balance of the account')) {
    return 'You need a little Arc USDC to pay for gas. Use Get test USDC in the Arc Studio sidebar.'
  }
  if (msg.includes('exceeds balance') || msg.includes('transfer amount exceeds') || msg.includes('insufficient balance')) {
    return 'Your balance is too low for this amount.'
  }
  if (msg.includes('allowance')) return 'Approve the token first, then try again.'
  if (msg.includes('timeout') || msg.includes('network') || msg.includes('fetch') || msg.includes('http request failed')) {
    return 'Network issue. Check your connection and try again.'
  }
  if (msg.includes('reverted')) return 'The transaction would fail on-chain. Check your balance and the amount, then try again.'
  return 'Something went wrong. Please try again.'
}

export type TxPhase = 'idle' | 'wallet' | 'confirming'

export interface TxCall {
  address: Address
  abi: Abi
  functionName: string
  args: readonly unknown[]
}

/**
 * One transaction at a time. A ref lock (set synchronously) means a double click sends one request,
 * even before React re-renders the disabled button.
 */
export function useTx() {
  const { account, switchToArc, getWalletClient, chainId } = useWallet()
  const { refresh } = useFund()
  const [phase, setPhase] = useState<TxPhase>('idle')
  const [error, setError] = useState<string | null>(null)
  const [hash, setHash] = useState<Hex | null>(null)
  const lock = useRef(false)

  const send = useCallback(
    async (call: TxCall): Promise<Hex | null> => {
      if (lock.current) return null
      lock.current = true
      setError(null)
      setHash(null)
      try {
        const client = getWalletClient()
        if (!client || !account) throw new Error('Connect your wallet first.')
        if (chainId !== CHAIN_ID) {
          const ok = await switchToArc()
          if (!ok) return null
        }
        setPhase('wallet')
        const { request } = await publicClient.simulateContract({ ...call, account } as never)
        const h = await client.writeContract(request as never)
        setHash(h)
        setPhase('confirming')
        const receipt = await publicClient.waitForTransactionReceipt({ hash: h })
        if (receipt.status !== 'success') throw new Error('Transaction reverted')
        await refresh()
        return h
      } catch (e) {
        setError(parseTxError(e))
        return null
      } finally {
        lock.current = false
        setPhase('idle')
      }
    },
    [account, chainId, getWalletClient, refresh, switchToArc],
  )

  const reset = useCallback(() => {
    setError(null)
    setHash(null)
  }, [])

  return { phase, busy: phase !== 'idle', error, hash, send, reset, setError }
}
