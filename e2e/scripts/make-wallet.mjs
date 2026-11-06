// Creates a throwaway testnet wallet for the end-to-end tests and saves it to e2e/.env.e2e (git-ignored).
// Only the address is printed; the recovery phrase stays in that file.
import { existsSync, writeFileSync } from 'node:fs'
import { english, generateMnemonic, mnemonicToAccount } from 'viem/accounts'

const file = new URL('../.env.e2e', import.meta.url)
if (existsSync(file)) {
  console.log('e2e/.env.e2e already exists; keeping the current test wallet.')
  process.exit(0)
}
const mnemonic = generateMnemonic(english)
const { address } = mnemonicToAccount(mnemonic)
writeFileSync(file, `E2E_SEED="${mnemonic}"\nE2E_ADDRESS=${address}\n`, { mode: 0o600 })
console.log(`Test wallet ${address} saved to e2e/.env.e2e`)
