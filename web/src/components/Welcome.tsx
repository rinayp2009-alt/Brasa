import { useEffect, useState } from 'react'
import { useStore } from '../store'

// First-visit welcome card (remembered per browser; works fine if storage is blocked)
export default function Welcome() {
  const { setStoryStep, storyStep } = useStore()
  const [show, setShow] = useState(false)
  useEffect(() => {
    let seen = false
    try { seen = localStorage.getItem('brasa_welcome_seen') === '1' } catch { /* storage blocked */ }
    if (!seen) setShow(true)
  }, [])
  const close = () => { setShow(false); try { localStorage.setItem('brasa_welcome_seen', '1') } catch { /* ignore */ } }
  if (!show || storyStep !== null) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center" role="dialog" aria-label="Welcome to BRASA">
      <div className="w-full max-w-[520px] rounded-2xl border border-fire/60 bg-ink p-6 shadow-[0_0_60px_rgba(255,138,61,0.25)]">
        <span className="label text-fire-soft">Welcome to BRASA</span>
        <h2 className="mt-2 font-display text-2xl font-semibold leading-tight">25 years of fires in Argentina, seen from space and finally comparable.</h2>
        <p className="mt-3 text-sm leading-relaxed text-soft">
          NASA has two fire-spotting satellites that count fires differently, so mixing them makes it look like fires doubled in 2012. BRASA blends them into one honest record. Pick any area to see its fire calendar, its fire season, what burns there, and how this week compares.
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <button onClick={() => { close(); setStoryStep(0) }}
            className="flex min-h-11 items-center gap-2 rounded-lg bg-fire px-5 text-sm font-semibold text-[#120A04]">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4l13 8-13 8z" /></svg>
            Take the 60-second tour
          </button>
          <button onClick={close} className="min-h-11 rounded-lg border border-line px-5 text-sm text-soft hover:border-muted">Explore on my own</button>
        </div>
      </div>
    </div>
  )
}
