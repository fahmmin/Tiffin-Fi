import { useEffect, useRef, useState } from 'react'
import { parseTxError } from './tx'

interface Result<T> {
  base: string
  key: string
  value?: T
  error?: string
}

/**
 * Debounced async read. `base` identifies the request (amount, tokens); `tick` re-runs the same request
 * (e.g. on every new block) without blanking the value in between. A null base disables it.
 */
export function useAsync<T>(base: string | null, tick: string, run: () => Promise<T>, delay = 300) {
  const [res, setRes] = useState<Result<T> | null>(null)
  const runRef = useRef(run)
  useEffect(() => {
    runRef.current = run
  })
  const key = `${base}|${tick}`

  useEffect(() => {
    if (base === null) return
    const ctrl = new AbortController()
    const timer = setTimeout(() => {
      runRef
        .current()
        .then((value) => {
          if (!ctrl.signal.aborted) setRes({ base, key, value })
        })
        .catch((e: unknown) => {
          if (!ctrl.signal.aborted) setRes({ base, key, error: parseTxError(e) })
        })
    }, delay)
    return () => {
      ctrl.abort()
      clearTimeout(timer)
    }
  }, [base, key, delay])

  const current = base !== null && res && res.base === base ? res : null
  return {
    value: current && current.error === undefined ? (current.value ?? null) : null,
    error: current?.error ?? null,
    pending: base !== null && (!res || res.key !== key),
  }
}
