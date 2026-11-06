import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createWalletClient, custom, getAddress, type Address, type EIP1193Provider, type WalletClient } from 'viem'
import { arcTestnet } from './chain'
import { CHAIN_ID } from './config'

interface WalletState {
  hasProvider: boolean
  account: Address | null
  chainId: number | null
  connecting: boolean
  switching: boolean
  wrongChain: boolean
  error: string | null
  connect: () => Promise<void>
  switchToArc: () => Promise<boolean>
  getWalletClient: () => WalletClient | null
}

const Ctx = createContext<WalletState | null>(null)

function getProvider(): EIP1193Provider | null {
  const eth = (window as unknown as { ethereum?: EIP1193Provider }).ethereum
  return eth ?? null
}

const hexToNumber = (v: unknown): number | null => {
  if (typeof v === 'number') return v
  if (typeof v === 'string') {
    const n = v.startsWith('0x') ? parseInt(v, 16) : parseInt(v, 10)
    return Number.isFinite(n) ? n : null
  }
  return null
}

export function isUserRejection(e: unknown): boolean {
  const err = e as { code?: number; name?: string; message?: string; cause?: unknown }
  if (err?.code === 4001) return true
  if (err?.name === 'UserRejectedRequestError') return true
  if (/user (rejected|denied)|rejected the request|cancell?ed/i.test(err?.message ?? '')) return true
  return err?.cause ? isUserRejection(err.cause) : false
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const [account, setAccount] = useState<Address | null>(null)
  const [chainId, setChainId] = useState<number | null>(null)
  const [connecting, setConnecting] = useState(false)
  const [switching, setSwitching] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const clientRef = useRef<WalletClient | null>(null)
  const provider = typeof window === 'undefined' ? null : getProvider()

  const getWalletClient = useCallback((): WalletClient | null => {
    const p = getProvider()
    if (!p) return null
    clientRef.current ??= createWalletClient({ chain: arcTestnet, transport: custom(p) })
    return clientRef.current
  }, [])

  // Quiet reconnect: a site the wallet already allows answers eth_accounts without a prompt.
  useEffect(() => {
    const p = getProvider()
    if (!p) return
    let cancelled = false
    const client = getWalletClient()
    void (async () => {
      try {
        const [accounts, chain] = await Promise.all([client!.getAddresses(), p.request({ method: 'eth_chainId' })])
        if (cancelled) return
        setAccount(accounts[0] ? getAddress(accounts[0]) : null)
        setChainId(hexToNumber(chain))
      } catch {
        /* read-only mode keeps working */
      }
    })()

    const onAccounts = (accs: unknown) => {
      const list = accs as string[]
      setAccount(list?.[0] ? getAddress(list[0]) : null)
    }
    const onChain = (c: unknown) => setChainId(hexToNumber(c))
    p.on('accountsChanged', onAccounts)
    p.on('chainChanged', onChain)
    return () => {
      cancelled = true
      p.removeListener('accountsChanged', onAccounts)
      p.removeListener('chainChanged', onChain)
    }
  }, [getWalletClient])

  const switchToArc = useCallback(async (): Promise<boolean> => {
    const client = getWalletClient()
    if (!client) return false
    setSwitching(true)
    setError(null)
    try {
      try {
        await client.switchChain({ id: CHAIN_ID })
      } catch (e) {
        if ((e as { code?: number })?.code === 4902 || /unrecognized chain|4902/i.test((e as Error)?.message ?? '')) {
          await client.addChain({ chain: arcTestnet })
          await client.switchChain({ id: CHAIN_ID })
        } else {
          throw e
        }
      }
      const p = getProvider()
      if (p) setChainId(hexToNumber(await p.request({ method: 'eth_chainId' })))
      return true
    } catch (e) {
      setError(isUserRejection(e) ? 'You cancelled the request in your wallet.' : 'Could not switch to Arc testnet. Switch networks in your wallet.')
      return false
    } finally {
      setSwitching(false)
    }
  }, [getWalletClient])

  const connect = useCallback(async () => {
    const client = getWalletClient()
    if (!client) {
      setError('No wallet found. Install a browser wallet such as MetaMask or Rabby to connect.')
      return
    }
    setConnecting(true)
    setError(null)
    try {
      const accounts = await client.requestAddresses()
      setAccount(accounts[0] ? getAddress(accounts[0]) : null)
      const p = getProvider()
      const id = p ? hexToNumber(await p.request({ method: 'eth_chainId' })) : null
      setChainId(id)
      if (id !== CHAIN_ID) await switchToArc()
    } catch (e) {
      setError(isUserRejection(e) ? 'You cancelled the request in your wallet.' : 'Could not connect your wallet. Try again.')
    } finally {
      setConnecting(false)
    }
  }, [getWalletClient, switchToArc])

  const value = useMemo<WalletState>(
    () => ({
      hasProvider: !!provider,
      account,
      chainId,
      connecting,
      switching,
      wrongChain: !!account && chainId !== null && chainId !== CHAIN_ID,
      error,
      connect,
      switchToArc,
      getWalletClient,
    }),
    [provider, account, chainId, connecting, switching, error, connect, switchToArc, getWalletClient],
  )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useWallet(): WalletState {
  const v = useContext(Ctx)
  if (!v) throw new Error('useWallet must be used inside WalletProvider')
  return v
}
