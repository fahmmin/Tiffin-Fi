import { useCallback, useEffect, useMemo, useState } from 'react'
import { createWalletClient, custom, getAddress, type Address, type EIP1193Provider } from 'viem'
import { arc } from '../config.ts'
import { explain } from './tx.ts'

declare global {
  interface Window {
    ethereum?: EIP1193Provider
  }
}

/** The visitor's injected wallet (MetaMask, Rabby). Everything read-only works without one. */
export function useWallet() {
  const provider = typeof window === 'undefined' ? undefined : window.ethereum
  const wallet = useMemo(() => provider && createWalletClient({ chain: arc, transport: custom(provider) }), [provider])
  const [address, setAddress] = useState<Address>()
  const [chainId, setChainId] = useState<number>()
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState<string>()

  useEffect(() => {
    if (!provider) return
    const onAccounts = (accounts: Address[]) => setAddress(accounts[0] ? getAddress(accounts[0]) : undefined)
    const onChain = (id: string) => setChainId(Number(id))
    // Reconnect quietly if this site was already allowed.
    provider.request({ method: 'eth_accounts' }).then(onAccounts, () => {})
    provider.request({ method: 'eth_chainId' }).then(onChain, () => {})
    provider.on('accountsChanged', onAccounts)
    provider.on('chainChanged', onChain)
    return () => {
      provider.removeListener('accountsChanged', onAccounts)
      provider.removeListener('chainChanged', onChain)
    }
  }, [provider])

  /** Switches to Arc testnet, adding it to the wallet first if it is missing. */
  const switchToArc = useCallback(async () => {
    if (!wallet) return
    try {
      await wallet.switchChain({ id: arc.id })
    } catch (e) {
      if ((e as { code?: number }).code === 4001) throw e
      await wallet.addChain({ chain: arc })
    }
    setChainId(arc.id)
  }, [wallet])

  const connect = useCallback(async () => {
    if (!wallet) {
      setError('No wallet found. Open this page in MetaMask or Rabby, or install one, to trade. Everything else works without it.')
      return
    }
    setConnecting(true)
    setError(undefined)
    try {
      const [account] = await wallet.requestAddresses()
      setAddress(getAddress(account))
      await switchToArc()
    } catch (e) {
      setError(explain(e))
    } finally {
      setConnecting(false)
    }
  }, [wallet, switchToArc])

  /** switchToArc for buttons: shows the error instead of throwing. */
  const requestArc = useCallback(async () => {
    setError(undefined)
    try {
      await switchToArc()
    } catch (e) {
      setError(explain(e))
    }
  }, [switchToArc])

  return { wallet, address, onArc: chainId === arc.id, connect, switchToArc, requestArc, connecting, error }
}

export type Wallet = ReturnType<typeof useWallet>
