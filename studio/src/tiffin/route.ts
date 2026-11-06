import { useEffect, useState } from 'react'

export type Route = 'landing' | 'fund' | 'trade' | 'activity' | 'how'

export const APP_ROUTES: { id: Exclude<Route, 'landing'>; label: string; title: string }[] = [
  { id: 'fund', label: 'Fund', title: 'The fund' },
  { id: 'trade', label: 'Trade', title: 'Trade' },
  { id: 'activity', label: 'Activity', title: 'Activity' },
  { id: 'how', label: 'How it works', title: 'How it works' },
]

export function parseHash(hash: string): Route {
  const h = hash.replace(/^#\/?/, '').split('?')[0].toLowerCase()
  if (h === 'fund' || h === 'trade' || h === 'activity' || h === 'how') return h
  return 'landing'
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash))
  useEffect(() => {
    const on = () => {
      setRoute(parseHash(window.location.hash))
      window.scrollTo({ top: 0 })
    }
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  return route
}

export const href = (r: Route) => (r === 'landing' ? '#' : `#${r}`)
