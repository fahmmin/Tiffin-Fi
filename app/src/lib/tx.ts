import { useCallback, useState } from 'react'
import {
  BaseError,
  ContractFunctionRevertedError,
  UserRejectedRequestError,
  decodeErrorResult,
  parseAbi,
  type Hash,
  type Hex,
} from 'viem'
import { hookAbi } from '../abi/hook.ts'
import { client } from '../config.ts'

/** Uniswap v4 wraps a hook's revert in this error, so router calls need it to decode the hook's reason. */
export const wrappedErrorAbi = parseAbi(['error WrappedError(address target, bytes4 selector, bytes reason, bytes details)'])

const REASONS: Record<string, string> = {
  Slippage: 'The price moved more than 0.5% before your trade went through. Check the new preview and try again.',
  TooLarge: 'That is more than 30% of what the basket holds of that asset, the most one trade can take. Try a smaller amount.',
  ZeroAmount: 'That amount is too small to trade.',
  EmptyFund: 'The basket is empty, so it has no price yet.',
  UnknownAsset: 'That asset is not in the basket.',
  ExactOutputNotSupported: 'The basket only takes swaps with an exact amount in.',
}

function errorName(revert: ContractFunctionRevertedError): string | undefined {
  const name = revert.data?.errorName
  if (name !== 'WrappedError') return name
  try {
    return decodeErrorResult({ abi: hookAbi, data: revert.data?.args?.[2] as Hex }).errorName
  } catch {
    return undefined
  }
}

/** A sentence a person can act on, from any wallet, RPC or contract error. */
export function explain(e: unknown): string {
  if (!(e instanceof BaseError)) return e instanceof Error ? e.message : 'Something went wrong. Try again.'
  if (e.walk((x) => x instanceof UserRejectedRequestError || (x as { code?: unknown }).code === 4001)) {
    return 'You cancelled the request in your wallet.'
  }
  const revert = e.walk((x) => x instanceof ContractFunctionRevertedError)
  if (revert instanceof ContractFunctionRevertedError) {
    const name = errorName(revert)
    if (name && REASONS[name]) return REASONS[name]
    const reason = revert.reason ?? ''
    if (/allowance|TRANSFER_FROM_FAILED|exceeds balance/i.test(reason)) {
      return 'Your wallet does not have enough of that token for this, or its approval is too small.'
    }
    if (reason || name) return `The basket refused this trade (${reason || name}).`
  }
  if (/insufficient funds/i.test(e.message)) {
    return 'Your wallet needs a little USDC to pay for gas. Get test USDC from faucet.circle.com.'
  }
  if (/chain/i.test(e.shortMessage) && /match|mismatch|current/i.test(e.shortMessage)) {
    return 'Your wallet is on another network. Switch it to Arc testnet and try again.'
  }
  return e.shortMessage
}

export type TxState =
  | { status: 'idle' }
  | { status: 'signing'; label: string }
  | { status: 'pending'; label: string; hash: Hash }
  | { status: 'confirmed'; label: string; hash: Hash }
  | { status: 'failed'; label: string; message: string; hash?: Hash }

/** Runs one transaction through wallet, pending and confirmed states. `onSettled` refreshes balances after. */
export function useTx(onSettled: () => void) {
  const [state, setState] = useState<TxState>({ status: 'idle' })

  const run = useCallback(
    async (label: string, send: () => Promise<Hash>) => {
      setState({ status: 'signing', label })
      let hash: Hash | undefined
      try {
        hash = await send()
        setState({ status: 'pending', label, hash })
        const receipt = await client.waitForTransactionReceipt({ hash })
        if (receipt.status !== 'success') {
          setState({ status: 'failed', label, hash, message: 'It reverted on chain. Open it in the explorer for details.' })
          return false
        }
        setState({ status: 'confirmed', label, hash })
        return true
      } catch (e) {
        setState({ status: 'failed', label, hash, message: explain(e) })
        return false
      } finally {
        onSettled()
      }
    },
    [onSettled],
  )

  const fail = useCallback((label: string, e: unknown) => setState({ status: 'failed', label, message: explain(e) }), [])
  const busy = state.status === 'signing' || state.status === 'pending'
  return { state, run, fail, busy }
}
