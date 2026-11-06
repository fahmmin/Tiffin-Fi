import { useEffect, useRef, useState } from 'react'

export type Route = 'landing' | 'fund' | 'trade' | 'activity' | 'how'

export const APP_ROUTES: { id: Exclude<Route, 'landing'>; label: string; short: string; title: string }[] = [
  { id: 'fund', label: 'Fund', short: 'Fund', title: 'The fund' },
  { id: 'trade', label: 'Trade', short: 'Trade', title: 'Buy, sell or swap' },
  { id: 'activity', label: 'Activity', short: 'Activity', title: 'Activity' },
  { id: 'how', label: 'How it works', short: 'How', title: 'How it works' },
]

export function parseHash(hash: string): Route {
  const h = hash.replace(/^#\/?/, '').split('?')[0].toLowerCase()
  if (h === 'fund' || h === 'trade' || h === 'activity' || h === 'how') return h
  // Anything else (#, #architecture, #live...) is a landing page anchor.
  return 'landing'
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash))
  const last = useRef(route)
  useEffect(() => {
    const on = () => {
      const next = parseHash(window.location.hash)
      // In-page anchors on the landing page keep their own scroll position.
      const anchorOnLanding = next === 'landing' && last.current === 'landing' && window.location.hash.length > 1
      last.current = next
      setRoute(next)
      if (!anchorOnLanding) window.scrollTo({ top: 0 })
    }
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  return route
}

export const href = (r: Route) => (r === 'landing' ? '#' : `#${r}`)
