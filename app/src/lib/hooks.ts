import { useCallback, useEffect, useRef, useState } from 'react'
import type { Address } from 'viem'
import { readFund, type Fund } from './basket.ts'
import { explain } from './tx.ts'

const POLL_MS = 15_000 // the public RPC is rate-limited; one multicall every 15 s is plenty

/** The fund's state, polled while the page is visible. Keeps the last good read if a poll fails. */
export function useFund(user?: Address) {
  const [fund, setFund] = useState<Fund>()
  const [error, setError] = useState(false)
  const seq = useRef(0)

  const refresh = useCallback(async () => {
    const id = ++seq.current
    try {
      const next = await readFund(user)
      if (id === seq.current) {
        setFund(next)
        setError(false)
      }
    } catch {
      if (id === seq.current) setError(true)
    }
  }, [user])

  useEffect(() => {
    void refresh()
    const id = setInterval(() => document.hidden || void refresh(), POLL_MS)
    return () => clearInterval(id)
  }, [refresh])

  // Rows for a previous account must not show while the new one loads.
  const current = fund && fund.user?.address !== user ? { ...fund, user: undefined } : fund
  return { fund: current, error, refresh }
}

export type AsyncState<T> = { value?: T; error?: string; loading: boolean }

/** Runs `fn` 350 ms after its inputs settle; `fn` undefined clears the result. Older results never overwrite newer. */
export function useDebounced<T>(fn: (() => Promise<T>) | undefined, deps: unknown[]): AsyncState<T> {
  const [state, setState] = useState<AsyncState<T>>({ loading: false })
  useEffect(() => {
    if (!fn) {
      setState({ loading: false })
      return
    }
    let live = true
    setState((s) => ({ ...s, loading: true }))
    const id = setTimeout(() => {
      fn().then(
        (value) => live && setState({ value, loading: false }),
        (e) => live && setState({ error: explain(e), loading: false }),
      )
    }, 350)
    return () => {
      live = false
      clearTimeout(id)
    }
  }, deps)
  return state
}

/** The current time, ticking every `ms`. */
export function useNow(ms = 30_000) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms)
    return () => clearInterval(id)
  }, [ms])
  return now
}
