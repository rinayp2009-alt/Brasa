import { useEffect } from 'react'
import type { Mode } from '../data'
import { useStore } from '../store'

interface Step {
  title: string
  text: string
  region: string
  mode: Mode
  month: string
  colorBy: 'fire' | 'land'
  live?: boolean
}

const STEPS: Step[] = [
  {
    title: '1 · The problem',
    text: 'NASA has watched fires from space since 2000, but with two different sensors. Throw MODIS and VIIRS together and fire activity seems to double in 2012, then jump again in 2018. Those jumps are new satellites, not new fires.',
    region: 'argentina', mode: 'naive', month: '2013-09', colorBy: 'fire',
  },
  {
    title: '2 · The fix',
    text: 'BRASA counts burning hexagon-days and calibrates MODIS to VIIRS on the 14 years both flew. The fake jumps disappear, and every year from 2000 to 2025 can finally be compared fairly. Tested year by year: 3.5% average error for the whole country.',
    region: 'argentina', mode: 'harm', month: '2013-09', colorBy: 'fire',
  },
  {
    title: '3 · Paraná Delta, August 2020',
    text: 'The wetlands next to Rosario burned for months. August 2020 had about five times the burning of a normal August, one of the four worst Augusts on record, in a near-tie with 2004, 2006 and 2008. That kind of comparison is only possible because the old and new satellites are blended fairly.',
    region: 'delta', mode: 'harm', month: '2020-08', colorBy: 'fire',
  },
  {
    title: '4 · An earlier warning: April 2008',
    text: 'In April 2008, smoke from Delta fires blanketed Buenos Aires. Because BRASA harmonizes the old MODIS-only years, this pre-VIIRS crisis shows up on the same scale as 2020. Without harmonization it would look small.',
    region: 'delta', mode: 'harm', month: '2008-04', colorBy: 'fire',
  },
  {
    title: '5 · What is burning?',
    text: 'Each fire is matched to NASA’s land cover map. In the Gran Chaco, forest and woodland fires (green) make up a much bigger share than elsewhere, a sign of forest clearing, not just grassland burns.',
    region: 'chaco', mode: 'harm', month: '2019-10', colorBy: 'land',
  },
  {
    title: '6 · Right now',
    text: 'The top bar compares the last 5 days of live NASA detections with 25 years of history for the same month, so responders know at a glance whether this week is normal or dangerous. Now explore: pick any area, or draw your own.',
    region: 'argentina', mode: 'harm', month: '2020-09', colorBy: 'fire', live: true,
  },
]

export default function Story({ months }: { months: string[] }) {
  const { storyStep, setStoryStep, setRegion, setMode, setMonth, setColorBy, setPlaying, setShowLive } = useStore()

  useEffect(() => {
    if (storyStep === null) return
    const st = STEPS[storyStep]
    setPlaying(false)
    setRegion(st.region)
    setMode(st.mode)
    setMonth(months.indexOf(st.month))
    setColorBy(st.colorBy)
    setShowLive(!!st.live)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [storyStep]) // eslint-disable-line react-hooks/exhaustive-deps

  if (storyStep === null) return null
  const st = STEPS[storyStep]
  const last = storyStep === STEPS.length - 1

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 mx-auto max-w-[560px] rounded-2xl border border-fire/60 bg-ink/95 p-5 shadow-[0_0_40px_rgba(255,138,61,0.25)] backdrop-blur sm:left-auto sm:right-6"
      role="dialog" aria-label="Guided tour">
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="label text-fire-soft">Guided tour · {storyStep + 1} of {STEPS.length}</span>
        <button onClick={() => setStoryStep(null)} aria-label="Close tour" className="rounded-md px-2 text-lg text-muted hover:text-text">×</button>
      </div>
      <h3 className="font-display text-xl font-semibold">{st.title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-soft">{st.text}</p>
      <div className="mt-4 flex items-center justify-between gap-3">
        <div className="flex gap-1.5">
          {STEPS.map((_, i) => (
            <button key={i} onClick={() => setStoryStep(i)} aria-label={`Go to step ${i + 1}`}
              className={`h-2 rounded-full transition-all ${i === storyStep ? 'w-6 bg-fire' : 'w-2 bg-line hover:bg-muted'}`} />
          ))}
        </div>
        <div className="flex gap-2">
          {storyStep > 0 && (
            <button onClick={() => setStoryStep(storyStep - 1)} className="min-h-10 rounded-lg border border-line px-4 text-sm text-soft hover:border-muted">Back</button>
          )}
          <button onClick={() => setStoryStep(last ? null : storyStep + 1)}
            className="min-h-10 rounded-lg bg-fire px-4 text-sm font-semibold text-[#120A04]">
            {last ? 'Explore on my own' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  )
}
