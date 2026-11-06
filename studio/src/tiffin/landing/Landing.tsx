import { useEffect } from 'react'
import { TestnetBanner } from '../Shell'
import { href } from '../route'
import { CtaLink, ReadBanner, Wordmark } from '../ui'
import { useFund } from '../useFund'
import { BuiltWith, Numbers } from './BuiltNumbers'
import { Compare } from './Compare'
import { FooterPanel } from './FooterPanel'
import { Hero } from './Hero'
import { LiveFund } from './LiveFund'
import { Proof } from './Proof'
import { Roadmap, Steps } from './StepsRoadmap'
import { Walkthrough } from './Walkthrough'
import { WhyParts } from './WhyParts'

const NAV = [
  { id: 'architecture', label: 'Architecture' },
  { id: 'steps', label: 'How it works' },
  { id: 'compare', label: 'Why it pays' },
  { id: 'proof', label: 'Proof' },
  { id: 'live', label: 'Live fund' },
  { id: 'roadmap', label: 'Roadmap' },
]

export function Landing() {
  const { error } = useFund()

  // A page opened on #live (or any section anchor) scrolls there once the sections exist.
  useEffect(() => {
    const id = window.location.hash.replace(/^#/, '')
    if (!id) return
    const t = setTimeout(() => document.getElementById(id)?.scrollIntoView(), 50)
    return () => clearTimeout(t)
  }, [])

  return (
    <div className="bg-white">
      <div className="mx-auto max-w-[1408px] px-2 pb-2 pt-2">
        <TestnetBanner className="text-center" />
        {error && <ReadBanner message={error} className="mt-2 text-center" />}

        <header className="sticky top-0 z-40 -mx-2 mt-1 bg-white/80 px-4 backdrop-blur-md">
          <div className="flex items-center justify-between gap-3 py-3">
            <a href={href('landing')} aria-label="Tiffin Fi home" className="rounded-xl">
              <Wordmark />
            </a>
            <nav aria-label="Sections" className="hidden items-center gap-0.5 lg:flex">
              {NAV.map((n) => (
                <a key={n.id} href={`#${n.id}`} className="label min-h-11 rounded-full px-3.5 py-3 text-[14px] font-medium text-ink transition hover:bg-well">
                  {n.label}
                </a>
              ))}
            </nav>
            <CtaLink href={href('fund')}>Open app</CtaLink>
          </div>
        </header>

        <main className="space-y-2">
          <Hero />
          <WhyParts />
          <Walkthrough />
          <Compare />
          <LiveFund />
          <Proof />
          <BuiltWith />
          <Numbers />
          <Steps />
          <Roadmap />
          <FooterPanel />
        </main>
      </div>
    </div>
  )
}
