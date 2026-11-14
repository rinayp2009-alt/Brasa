import { useEffect, useMemo, useState } from 'react'
import type { Dataset, Mode } from './data'
import { MONTH_NAMES, REGIONS, anomalies, fmt, loadData, pick, rankOf, regionSeries, season, ym } from './data'
import { rampCss } from './colors'
import { useStore } from './store'
import MapView from './components/MapView'
import Calendar from './components/Calendar'
import AnnualChart from './components/AnnualChart'
import ValidationChart from './components/ValidationChart'

const MODES: { id: Mode; name: string }[] = [
  { id: 'modis', name: 'Raw MODIS' },
  { id: 'naive', name: 'MODIS + VIIRS (naive)' },
  { id: 'harm', name: 'Harmonized' },
]

const MODE_NOTE: Record<Mode, { text: string; tone: 'plain' | 'warn' }> = {
  modis: { text: 'One consistent sensor since 2000, but MODIS misses the small fires VIIRS can see.', tone: 'plain' },
  naive: { text: 'Throwing every sensor together creates fake jumps when VIIRS arrives in 2012 and NOAA-20 in 2018. Every year after looks like a crisis. This is the problem the challenge asks us to solve.', tone: 'warn' },
  harm: { text: 'MODIS is calibrated to VIIRS on their 2012–2025 overlap, giving one consistent record from 2000 to today. Whiskers show the 90% range for years estimated from MODIS.', tone: 'plain' },
}

function Logo() {
  return (
    <svg width="40" height="40" viewBox="0 0 40 40" aria-hidden="true">
      <polygon points="20,2 36,11 36,29 20,38 4,29 4,11" fill="none" stroke="#FF8A3D" strokeWidth="2" />
      <path d="M20 10c4 6 7 9 7 14a7 7 0 0 1-14 0c0-3 2-5 3-7 1 3 2 4 4 4-1-4-1-7 0-11z" fill="#FF8A3D" />
    </svg>
  )
}

export default function App() {
  const [ds, setDs] = useState<Dataset | null>(null)
  const [err, setErr] = useState<string | null>(null)
  useEffect(() => { loadData().then(setDs).catch((e) => setErr(String(e))) }, [])

  if (err) return <div className="p-10 text-fire">Could not load data: {err}</div>
  if (!ds) return <Loading />
  return <Dashboard ds={ds} />
}

function Loading() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4">
      <Logo />
      <div className="font-display text-xl tracking-[0.2em]">BRASA</div>
      <div className="label">Loading 25 years of NASA fire data…</div>
      <div className="h-1 w-48 overflow-hidden rounded bg-line"><div className="h-full w-1/3 animate-pulse bg-fire" /></div>
    </div>
  )
}

function Dashboard({ ds }: { ds: Dataset }) {
  const s = useStore()
  const months = ds.meta.months
  const monthIdx = s.monthIdx < 0 ? months.indexOf('2020-08') : s.monthIdx

  useEffect(() => { if (s.monthIdx < 0) s.setMonth(months.indexOf('2020-08')) }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // play through time
  useEffect(() => {
    if (!s.playing) return
    const t = setInterval(() => {
      const cur = useStore.getState().monthIdx
      useStore.getState().setMonth(cur >= months.length - 1 ? 0 : cur + 1)
    }, 220)
    return () => clearInterval(t)
  }, [s.playing, months.length])

  // keep the URL in sync so any view can be shared
  useEffect(() => {
    const p = new URLSearchParams()
    if (s.regionId !== 'custom') p.set('region', s.regionId)
    p.set('mode', s.mode); p.set('t', String(monthIdx))
    window.history.replaceState(null, '', `?${p.toString()}`)
  }, [s.regionId, s.mode, monthIdx])

  // keyboard: space play/pause, arrows step months
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'INPUT') return
      const st = useStore.getState()
      if (e.key === ' ') { e.preventDefault(); st.setPlaying(!st.playing) }
      if (e.key === 'ArrowRight') st.setMonth(Math.min(months.length - 1, st.monthIdx + 1))
      if (e.key === 'ArrowLeft') st.setMonth(Math.max(0, st.monthIdx - 1))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [months.length])

  const region = s.regionId === 'custom' && s.customBox
    ? { id: 'custom', name: 'Your area', blurb: 'Custom area you drew on the map', bbox: s.customBox }
    : REGIONS.find((r) => r.id === s.regionId) || REGIONS[0]

  const series = useMemo(() => regionSeries(ds, region.bbox), [ds, region.bbox])
  const values = pick(series, s.mode)
  const { z, typical } = useMemo(() => anomalies(months, values), [months, values])
  const seas = useMemo(() => season(months, series.harm), [months, series.harm])

  const { y, m } = ym(months[monthIdx])
  const cur = values[monthIdx]
  const zc = z[monthIdx]
  const rank = rankOf(months, values, monthIdx)
  const extreme = zc >= 2 || (rank.rank > 0 && rank.rank <= 2 && cur > 2 * typical[m - 1])
  const status = extreme ? { t: 'Extreme activity', c: 'bg-glow text-ink' }
    : zc >= 1 ? { t: 'Above normal', c: 'bg-[#2A1A0E] text-fire-soft' }
    : zc <= -1 ? { t: 'Below normal', c: 'bg-[#121B2C] text-[#9CC0FF]' }
    : { t: 'Typical', c: 'bg-[#1B1F27] text-soft' }
  const note = MODE_NOTE[s.mode]
  const v = ds.validation

  return (
    <div className="min-h-screen px-4 pb-14 pt-5 sm:px-8">
      <div className="mx-auto flex max-w-[1400px] flex-col gap-4">

        {/* Header */}
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Logo />
            <div>
              <h1 className="font-display text-2xl font-bold tracking-[0.08em]">BRASA</h1>
              <p className="text-[13px] text-muted">Harmonized burning activity calendar · NASA MODIS + VIIRS · Argentina 2000–2025</p>
            </div>
          </div>
          <a href="#method" className="rounded-full border border-line px-4 py-2 text-sm text-soft no-underline hover:border-fire hover:text-fire">How it works</a>
        </header>

        {/* Controls */}
        <section className="flex flex-wrap items-end gap-5">
          <div className="flex flex-col gap-2">
            <span className="label">Area of interest</span>
            <div className="flex flex-wrap gap-1.5">
              {REGIONS.map((r) => (
                <button key={r.id} onClick={() => s.setRegion(r.id)} aria-pressed={s.regionId === r.id}
                  className={`min-h-11 rounded-[10px] border px-4 text-sm font-medium transition ${s.regionId === r.id ? 'border-fire bg-[#2A1A0E] text-fire-soft' : 'border-line bg-panel text-soft hover:border-muted'}`}>
                  {r.name}
                </button>
              ))}
              <button onClick={() => s.setDrawing(!s.drawing)} aria-pressed={s.drawing || s.regionId === 'custom'}
                className={`min-h-11 rounded-[10px] border px-4 text-sm font-medium transition ${s.drawing || s.regionId === 'custom' ? 'border-glow bg-[#1A1710] text-glow' : 'border-dashed border-muted bg-panel text-soft hover:border-glow'}`}>
                {s.drawing ? 'Cancel drawing' : '+ Draw your own area'}
              </button>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <span className="label">Sensor record</span>
            <div className="flex flex-wrap gap-1 rounded-xl border border-line bg-panel p-1">
              {MODES.map((md) => (
                <button key={md.id} onClick={() => s.setMode(md.id)} aria-pressed={s.mode === md.id}
                  className={`min-h-10 rounded-lg px-3.5 text-[13px] font-semibold transition ${s.mode === md.id ? 'bg-fire text-[#120A04]' : 'text-soft hover:text-text'}`}>
                  {md.name}
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* Time bar */}
        <section className="panel flex flex-wrap items-center gap-4 px-4 py-3">
          <button onClick={() => s.setPlaying(!s.playing)} aria-label={s.playing ? 'Pause' : 'Play through time'}
            className="flex h-11 w-11 flex-none items-center justify-center rounded-full border border-fire bg-[#1E1610] text-fire">
            {s.playing
              ? <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="5" width="4" height="14" /><rect x="14" y="5" width="4" height="14" /></svg>
              : <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4l13 8-13 8z" /></svg>}
          </button>
          <div className="min-w-[120px] font-display text-2xl font-semibold">{MONTH_NAMES[m - 1]} {y}</div>
          <div className="flex min-w-0 flex-[1_1_300px] flex-col gap-0.5">
            <label htmlFor="scrub" className="font-mono text-[11px] text-muted">Drag through time, or press space to play · ← → step months</label>
            <input id="scrub" type="range" min={0} max={months.length - 1} value={monthIdx}
              onChange={(e) => { s.setPlaying(false); s.setMonth(+e.target.value) }} className="h-7 w-full cursor-pointer" />
          </div>
        </section>

        {/* Map + side */}
        <section className="flex flex-wrap gap-4">
          <div className="panel flex min-h-[460px] flex-[1_1_520px] flex-col gap-2 p-3">
            <div className="flex items-center justify-between px-1">
              <h2 className="font-display text-base font-semibold">Fire activity · {MONTH_NAMES[m - 1]} {y}</h2>
              <label className="flex cursor-pointer items-center gap-2 text-xs text-soft">
                <input type="checkbox" checked={s.extruded} onChange={(e) => s.setExtruded(e.target.checked)} /> 3D view
              </label>
            </div>
            <div className="relative min-h-[420px] flex-1"><MapView ds={ds} bbox={region.bbox} /></div>
            <div className="flex items-center gap-2 px-1 font-mono text-[11px] text-muted">
              <span>1 day</span>
              <div className="h-2 flex-1 rounded" style={{ background: `linear-gradient(90deg, ${[0.15, 0.4, 0.6, 0.8, 1].map(rampCss).join(',')})` }} />
              <span>whole month burning</span>
            </div>
          </div>

          <div className="flex min-w-0 flex-[1_1_380px] flex-col gap-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="panel flex flex-col gap-1.5 p-4">
                <span className="label truncate">{region.name}</span>
                <span className="font-display text-[32px] font-bold leading-none">{fmt(cur)}</span>
                <span className="text-xs text-muted">fire-active cell-days this month</span>
              </div>
              <div className="panel flex flex-col gap-1.5 p-4">
                <span className="label">vs typical {MONTH_NAMES[m - 1]}</span>
                <span className={`font-display text-[32px] font-bold leading-none ${extreme ? 'text-glow' : zc >= 1 ? 'text-fire-soft' : zc <= -1 ? 'text-[#9CC0FF]' : ''}`}>
                  {typical[m - 1] > 0 ? `${cur >= typical[m - 1] ? '+' : '−'}${Math.round(Math.abs(cur / typical[m - 1] - 1) * 100)}%` : '–'}
                </span>
                <span className="text-xs text-muted">typical {fmt(typical[m - 1])} · {rank.rank ? `#${rank.rank} of ${rank.of}` : ''}</span>
              </div>
              <div className="panel flex flex-col gap-1.5 p-4">
                <span className="label">Status</span>
                <span><span className={`mt-1 inline-block rounded-full px-3 py-1.5 text-sm font-semibold ${status.c}`}>{status.t}</span></span>
                <span className="text-xs text-muted">Season {MONTH_NAMES[seas.start]}–{MONTH_NAMES[seas.end]}, peak {MONTH_NAMES[seas.peak]}</span>
              </div>
            </div>

            <div className="panel flex flex-col gap-2 p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="font-display text-base font-semibold">Burning activity per year · {region.name}</h2>
                <span className="font-mono text-[11px] text-muted">click a year to jump</span>
              </div>
              <AnnualChart months={months} modis={series.modis} naive={series.naive} harm={series.harm} lo={series.lo} hi={series.hi} mode={s.mode} />
              <p className={`rounded-lg px-3 py-2 text-[13px] leading-relaxed ${note.tone === 'warn' ? 'bg-fire-soft text-[#120A04]' : 'bg-[#1B1F27] text-soft'}`}>{note.text}</p>
            </div>

            <div className="panel flex flex-col gap-3 p-4">
              <h2 className="font-display text-base font-semibold">Fire season · {region.name}</h2>
              <p className="text-[13px] text-muted">{region.blurb}. Average harmonized activity per month, 2003–2025.</p>
              <div className="flex h-20 items-end gap-1">
                {seas.clim.map((c, i) => {
                  const t = c / Math.max(...seas.clim)
                  const inSeason = seas.start <= seas.end ? i >= seas.start && i <= seas.end : i >= seas.start || i <= seas.end
                  return (
                    <div key={i} className="flex flex-1 flex-col items-center gap-1">
                      <div className="w-full rounded-t" style={{ height: `${Math.max(4, t * 64)}px`, background: rampCss(0.2 + 0.8 * t), outline: i === m - 1 ? '2px solid #fff' : undefined }} title={`${MONTH_NAMES[i]}: ${fmt(c)}`} />
                      <span className={`font-mono text-[10px] ${inSeason ? 'text-fire-soft' : 'text-muted'}`}>{MONTH_NAMES[i][0]}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </section>

        {/* Calendar */}
        <section className="panel flex flex-col gap-2 p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-display text-base font-semibold">Burning calendar · {region.name} · {series.nCells.toLocaleString()} hexagons</h2>
            <div className="flex flex-wrap gap-4 text-xs text-soft">
              <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-4 rounded-sm border-[1.5px] border-glow" /> Extreme month (far above its normal)</span>
              <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-4 rounded-sm border-2 border-white" /> Selected</span>
            </div>
          </div>
          <div className="overflow-x-auto"><div className="min-w-[560px]"><Calendar months={months} values={values} z={z} /></div></div>
        </section>

        {/* Validation + method */}
        <section id="method" className="flex flex-wrap gap-4">
          <div className="panel flex flex-[1_1_420px] flex-col gap-2 p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-display text-base font-semibold">Does the harmonization work?</h2>
              <span className="font-mono text-xs text-glow">r = {v.r_annual.toFixed(3)} · {(v.mape_annual * 100).toFixed(1)}% yearly error</span>
            </div>
            <p className="text-[13px] text-muted">Each year from 2012 to 2025 was hidden, predicted from MODIS with a model fitted on the other years, then compared with what VIIRS really saw.</p>
            <ValidationChart v={v} />
            <div className="flex flex-wrap gap-4 text-xs text-soft">
              <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-fire" /> VIIRS observed</span>
              <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-cool" /> Predicted from MODIS</span>
            </div>
          </div>
          <div className="panel flex flex-[1_1_420px] flex-col gap-3 p-4 text-[13px] leading-relaxed text-soft">
            <h2 className="font-display text-base font-semibold text-text">How BRASA harmonizes the record</h2>
            <ol className="flex list-decimal flex-col gap-1.5 pl-5">
              <li><b className="text-text">Clean.</b> Vegetation fires only; MODIS confidence ≥ 30, VIIRS nominal or high. Volcanoes, gas flares and offshore sources removed.</li>
              <li><b className="text-text">Grid.</b> Every detection goes into an equal-area H3 hexagon (~250 km²). We count fire-active hexagon-days, which removes most of the 1 km vs 375 m pixel difference.</li>
              <li><b className="text-text">Calibrate.</b> On 2012–2025, when both sensors flew, fit log(VIIRS) = a<sub>month</sub> + b·log(MODIS). b = {ds.meta.models.modis_to_viirs.b.toFixed(2)}.</li>
              <li><b className="text-text">Extend.</b> Before 2012, MODIS is scaled to VIIRS-equivalent (Terra alone before Aqua in mid-2002). From 2012, VIIRS is used directly; NOAA-20 fills gaps.</li>
              <li><b className="text-text">Validate.</b> Leave-one-year-out test, shown on the left.</li>
            </ol>
            <p className="text-xs text-muted">Data: NASA FIRMS MODIS C6.1 and VIIRS 375 m (S-NPP, NOAA-20) active fire archives, {fmt(5669609)} detections. Basemap: NASA GIBS VIIRS Black Marble.</p>
          </div>
        </section>

        <footer className="text-center text-xs text-muted">BRASA · NASA Space Apps Challenge 2026 · Harmonization of MODIS and VIIRS Hot Spots</footer>
      </div>
    </div>
  )
}
