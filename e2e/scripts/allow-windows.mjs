// Synpress's cache CLI exits on native Windows ("use WSL instead"). We build the MetaMask cache on Windows anyway:
// this lifts that one platform check in the installed synpress-cache build. Re-run it after every npm install.
import { readFileSync, writeFileSync } from 'node:fs'

// Each fix: [what upstream ships, what we need on Windows].
const fixes = [
  // The platform check itself.
  ['if (os.platform() === "win32" && !isRunningInWsl()) {', 'if (false) {'],
  // path.join builds the setup-file pattern with backslashes, which glob reads as escapes, so it finds nothing.
  ['const fileList = (await glob(globPattern)).sort();', 'const fileList = (await glob(globPattern, { windowsPathsNoEscape: true })).sort();'],
  // tsup resolves entries with globby, which also needs forward slashes.
  ['    entry: fileList,\n', '    entry: fileList.map((f) => f.split("\\\\").join("/")),\n'],
  // Node's ESM loader needs a file:// URL for an absolute Windows path.
  [
    'const walletSetupModule = await import(walletSetupFilePath);',
    'const walletSetupModule = await import((await import("node:url")).pathToFileURL(walletSetupFilePath).href);',
  ],
]
const files = ['dist/index.js', 'dist/cli/index.js'].map((f) =>
  new URL(`../node_modules/@synthetixio/synpress-cache/${f}`, import.meta.url),
)
for (const file of files) {
  let src = readFileSync(file, 'utf8')
  for (const [from, to] of fixes) {
    if (src.includes(from)) {
      src = src.replace(from, to)
      console.log(`${file.pathname}: applied ${to.slice(0, 40)}…`)
    }
  }
  writeFileSync(file, src)
}
