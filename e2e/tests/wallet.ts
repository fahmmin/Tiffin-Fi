// A real injected wallet for the tests. To the app it looks like MetaMask (window.ethereum with request/on/
// removeListener, accountsChanged and chainChanged), but it signs and sends real Arc testnet transactions in Node with
// the throwaway e2e key. It starts on Ethereum without Arc, like a fresh MetaMask, so the app has to add Arc itself.
import { test as base, type Page } from '@playwright/test'
import { createPublicClient, createWalletClient, http, type Hex } from 'viem'
import { mnemonicToAccount } from 'viem/accounts'
import { arcTestnet } from 'viem/chains'

const ARC = 5042002
type Reply = { value?: unknown; error?: { code: number; message: string }; chainChanged?: string }

export type TestWallet = {
  address: `0x${string}`
  /** Transaction hashes this wallet sent, in order. */
  sent: Hex[]
  /** The next request that needs the user's approval is rejected, as if they pressed Cancel. */
  rejectNext: () => void
  /** Moves the wallet to another network, as if the user switched in MetaMask. */
  moveTo: (chainId: number) => Promise<void>
}

async function inject(page: Page, handle: (method: string, params: unknown[]) => Promise<Reply>) {
  await page.exposeFunction('__e2eWallet', handle)
  await page.addInitScript(() => {
    const listeners: Record<string, ((arg: unknown) => void)[]> = {}
    const emit = (event: string, arg: unknown) => (listeners[event] ?? []).forEach((fn) => fn(arg))
    const bridge = (window as unknown as { __e2eWallet: (m: string, p: unknown[]) => Promise<Reply> }).__e2eWallet
    const ethereum = {
      isMetaMask: true,
      async request({ method, params = [] }: { method: string; params?: unknown[] }) {
        const reply = await bridge(method, params)
        if (reply.error) throw Object.assign(new Error(reply.error.message), { code: reply.error.code })
        if (reply.chainChanged) emit('chainChanged', reply.chainChanged)
        return reply.value
      },
      on(event: string, fn: (arg: unknown) => void) {
        ;(listeners[event] ??= []).push(fn)
      },
      removeListener(event: string, fn: (arg: unknown) => void) {
        listeners[event] = (listeners[event] ?? []).filter((f) => f !== fn)
      },
    }
    Object.assign(window, { ethereum, __e2eEmit: emit })
  })
}

export const test = base.extend<{ wallet: TestWallet }>({
  wallet: async ({ page }, use) => {
    const seed = process.env.E2E_SEED
    if (!seed) throw new Error('E2E_SEED is missing: run "npm run wallet" and "npm run fund" first')
    const account = mnemonicToAccount(seed)
    const transport = http('https://rpc.testnet.arc.io', { retryCount: 5, retryDelay: 700 })
    const reader = createPublicClient({ chain: arcTestnet, transport })
    const signer = createWalletClient({ account, chain: arcTestnet, transport })
    let chainId = 1
    let arcAdded = false
    let connected = false
    let reject = false
    const sent: Hex[] = []
    const hex = (id: number) => `0x${id.toString(16)}`
    const cancelled = { error: { code: 4001, message: 'User rejected the request.' } }

    await inject(page, async (method, params) => {
      try {
        switch (method) {
          // Like MetaMask: no accounts until the site has been allowed to connect.
          case 'eth_accounts':
            return { value: connected ? [account.address] : [] }
          case 'eth_requestAccounts':
            if (reject) return (reject = false), cancelled
            connected = true
            return { value: [account.address] }
          case 'eth_chainId':
            return { value: hex(chainId) }
          case 'wallet_switchEthereumChain': {
            const id = Number((params[0] as { chainId: string }).chainId)
            if (id === ARC && !arcAdded) return { error: { code: 4902, message: 'Unrecognized chain ID.' } }
            chainId = id
            return { value: null, chainChanged: hex(id) }
          }
          case 'wallet_addEthereumChain': {
            if (reject) return (reject = false), cancelled
            const id = Number((params[0] as { chainId: string }).chainId)
            arcAdded ||= id === ARC
            chainId = id
            return { value: null, chainChanged: hex(id) }
          }
          case 'eth_sendTransaction': {
            if (reject) return (reject = false), cancelled
            if (chainId !== ARC) return { error: { code: 4901, message: 'The wallet is on another network.' } }
            const tx = params[0] as { to: Hex; data?: Hex; value?: Hex }
            const hash = await signer.sendTransaction({ to: tx.to, data: tx.data, value: tx.value ? BigInt(tx.value) : 0n })
            sent.push(hash)
            return { value: hash }
          }
          default:
            return { value: await reader.request({ method, params } as never) }
        }
      } catch (e) {
        const err = e as { code?: number; shortMessage?: string; message?: string }
        return { error: { code: err.code ?? -32603, message: err.shortMessage ?? err.message ?? 'Wallet error' } }
      }
    })

    await use({
      address: account.address,
      sent,
      rejectNext: () => {
        reject = true
      },
      moveTo: async (id) => {
        chainId = id
        await page.evaluate((h) => (window as unknown as { __e2eEmit: (e: string, a: string) => void }).__e2eEmit('chainChanged', h), hex(id))
      },
    })
  },
})

export const expect = test.expect
