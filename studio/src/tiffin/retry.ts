/**
 * Runs a read and, if it throws, tries again by itself before giving up. Used for chain reads that sit behind
 * rate-limited public RPCs, so one 429 does not reach the screen.
 */
export async function retryQuietly<T>(run: () => Promise<T>, retries = 3, delayMs = 1500): Promise<T> {
  let attempt = 0
  for (;;) {
    try {
      return await run()
    } catch (e) {
      if (attempt >= retries) throw e
      attempt += 1
      await new Promise((resolve) => setTimeout(resolve, delayMs))
    }
  }
}
