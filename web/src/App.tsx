import { useEffect, useMemo, useState } from 'react'
import type { Dataset, Mode } from './data'
import { LAND, MONTH_NAMES, REGIONS, anomalies, fmt, loadData, pick, rankOf, regionSeries, season, ym } from './data'
import { rampCss } from './colors'
import { useStore } from './store'
import MapView from './components/MapView'
import Calendar from './components/Calendar'
import AnnualChart from './components/AnnualChart'
import ValidationChart from './components/ValidationChart'
import WhatsBurning from './components/WhatsBurning'
import RightNow from './components/RightNow'
import Story from './components/Story'
import SeasonShift from './components/SeasonShift'
import Accuracy from './components/Accuracy'
import InfoTip from './components/InfoTip'
import Welcome from './components/Welcome'
import RecordTracker from './components/RecordTracker'
import { FULL_MONTHS, useT } from './i18n'

const MODES: { id: Mode; name: string; sub: string }[] = [
  { id: 'modis', name: 'Old satellite only', sub: 'MODIS' },
  { id: 'naive', name: 'Both mixed (wrong)', sub: 'MODIS + VIIRS added' },
  { id: 'harm', name: 'BRASA blended ✓', sub: 'harmonized' },
]

const UNIT_TIP = 'A “burning day” is one ~250 km² hexagon where a satellite saw at least one fire on that day. We add them up over the area and month, which treats both satellites fairly.'

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
  const t = useT()
  const es = s.lang === 'es'
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
    else if (s.customBox) { const b = s.customBox; p.set('box', [b.west, b.south, b.east, b.north].map((x) => x.toFixed(2)).join(',')) }
    p.set('mode', s.mode); p.set('t', String(monthIdx))
    window.history.replaceState(null, '', `?${p.toString()}`)
  }, [s.regionId, s.customBox, s.mode, monthIdx])
  const [copied, setCopied] = useState(false)

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
  const rName = t(region.name)

  const series = useMemo(() => regionSeries(ds, region.bbox), [ds, region.bbox])
  const values = pick(series, s.mode)
  const { z, typical } = useMemo(() => anomalies(months, values), [months, values])
  const seas = useMemo(() => season(months, series.harm), [months, series.harm])
  const recordByMonth = useMemo(() => {
    const r = new Array(12).fill(0)
    months.forEach((k, i) => { const mm = ym(k).m - 1; r[mm] = Math.max(r[mm], series.harm[i]) })
    return r
  }, [months, series.harm])

  const { y, m } = ym(months[monthIdx])
  const cur = values[monthIdx]
  const zc = z[monthIdx]
  const times = typical[m - 1] > 0 ? cur / typical[m - 1] : 0
  const rank = rankOf(months, values, monthIdx)
  const extreme = zc >= 2 || (rank.rank > 0 && rank.rank <= 3 && cur > 2 * typical[m - 1])
  const status = extreme ? { t: t('Extreme activity'), c: 'bg-glow text-ink' }
    : zc >= 1 || (typical[m - 1] > 0 && cur / typical[m - 1] >= 1.6) ? { t: t('Above normal'), c: 'bg-[#2A1A0E] text-fire-soft' }
    : zc <= -1 || (typical[m - 1] > 0 && cur / typical[m - 1] <= 0.5) ? { t: t('Below normal'), c: 'bg-[#121B2C] text-[#9CC0FF]' }
    : { t: t('Typical'), c: 'bg-[#1B1F27] text-soft' }
  const note = MODE_NOTE[s.mode]

  // one plain-English sentence for the selected area and month
  const mName = FULL_MONTHS[s.lang][m - 1]
  const headline = es
    ? (cur <= 0 ? `${mName} ${y} en ${rName}: no se detectaron fuegos.`
      : rank.rank === 1 ? `${mName} ${y} fue el peor ${mName} en ${rank.of} años en ${rName}.`
      : extreme && rank.rank <= 4 ? `${mName} ${y} fue uno de los peores ${mName}s registrados en ${rName} (#${rank.rank} de ${rank.of}).`
      : extreme ? `${mName} ${y} estuvo muy por encima de un ${mName} normal en ${rName}.`
      : zc >= 1 || times >= 1.6 ? `${mName} ${y} tuvo más quema que un ${mName} normal en ${rName}.`
      : zc <= -1 || times <= 0.5 ? `${mName} ${y} fue más tranquilo que un ${mName} normal en ${rName}.`
      : `${mName} ${y} fue un ${mName} bastante normal en ${rName}.`)
    : (cur <= 0 ? `${mName} ${y} in ${rName}: no fires detected.`
      : rank.rank === 1 ? `${mName} ${y} was the worst ${mName} in ${rank.of} years in ${rName}.`
      : extreme && rank.rank <= 4 ? `${mName} ${y} was one of the worst ${mName}s on record in ${rName} (#${rank.rank} of ${rank.of}).`
      : extreme ? `${mName} ${y} was far above a normal ${mName} in ${rName}.`
      : zc >= 1 || times >= 1.6 ? `${mName} ${y} was busier than a normal ${mName} in ${rName}.`
      : zc <= -1 || times <= 0.5 ? `${mName} ${y} was quieter than a normal ${mName} in ${rName}.`
      : `${mName} ${y} was a fairly normal ${mName} in ${rName}.`)
  const land = [series.crop[monthIdx], series.forest[monthIdx], series.grass[monthIdx]]
  const landName = ['cropland and farms', 'forest and woodland', 'grass, shrub and wetland']
  const domLand = land.some((x) => x > 0) ? t(landName[land.indexOf(Math.max(...land))]) : null
  const seasonTxt = es
    ? `La temporada de fuego acá suele ir de ${MONTH_NAMES[seas.start]} a ${MONTH_NAMES[seas.end]}, con pico en ${MONTH_NAMES[seas.peak]}.`
    : `Fire season here usually runs ${MONTH_NAMES[seas.start]}–${MONTH_NAMES[seas.end]}, peaking in ${MONTH_NAMES[seas.peak]}.`
  const compare = es
    ? (times >= 1.15 ? `${times.toFixed(1).replace('.', ',')}× un ${mName} normal` : times <= 0.85 ? `${Math.round(times * 100)}% de un ${mName} normal` : `cerca de un ${mName} normal`)
    : (times >= 1.15 ? `${times.toFixed(1)}× a normal ${mName}` : times <= 0.85 ? `${Math.round(times * 100)}% of a normal ${mName}` : `close to a normal ${mName}`)
  const subline = cur <= 0 ? seasonTxt
    : `${fmt(cur)} ${t('burning days')}, ${compare}. ${seasonTxt}`
      + (domLand && s.mode === 'harm' ? (es ? ` Se quema sobre todo ${domLand}.` : ` Mostly ${domLand} burning.`) : '')
  const v = ds.validation

  const share = async () => {
    try { await navigator.clipboard.writeText(window.location.href); setCopied(true); setTimeout(() => setCopied(false), 2000) } catch { window.prompt(es ? 'Copiá este enlace:' : 'Copy this link:', window.location.href) }
  }
  const download = () => {
    const rows = [['month', 'harmonized_burning_days', 'harmonized_low_90', 'harmonized_high_90', 'modis_only', 'both_mixed_unharmonized', 'cropland', 'forest_woodland', 'grass_shrub_wetland', 'source']]
    months.forEach((k, i) => rows.push([k, series.harm[i], series.lo[i], series.hi[i], series.modis[i], series.naive[i], series.crop[i], series.forest[i], series.grass[i], ds.meta.source[i] || ''].map((x) => typeof x === 'number' ? x.toFixed(1) : String(x))))
    const head = `# BRASA harmonized MODIS-VIIRS burning record, ${region.name}${region.bbox ? ` (W ${region.bbox.west}, S ${region.bbox.south}, E ${region.bbox.east}, N ${region.bbox.north})` : ''}\n# unit: fire-active H3 res-5 hexagon-days (~252 km2). Source: NASA FIRMS MODIS C6.1 + VIIRS 375 m. https://brasa-dekk.vercel.app\n`
    const blob = new Blob([head + rows.map((r) => r.join(',')).join('\n')], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const el = document.createElement('a')
    el.href = url; el.download = `brasa_${region.id}_2000-2025.csv`; el.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  return (
    <div className="min-h-screen px-4 pb-14 pt-5 sm:px-8">
      <div className="mx-auto flex max-w-[1400px] flex-col gap-4">

        {/* Header */}
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Logo />
            <div>
              <h1 className="font-display text-2xl font-bold tracking-[0.08em]">BRASA</h1>
              <p className="text-[13px] text-muted">{t('25 years of NASA fire satellites, blended into one honest record · Demo coverage: Argentina 2000–2025')}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => s.setStoryStep(0)} className="flex min-h-10 items-center gap-2 rounded-full bg-fire px-4 text-sm font-semibold text-[#120A04] shadow-[0_0_24px_rgba(255,138,61,0.35)]">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4l13 8-13 8z" /></svg>
              {t('Take the 60-second tour')}
            </button>
            <a href="#method" className="flex min-h-10 items-center rounded-full border border-line px-4 text-sm text-soft no-underline hover:border-fire hover:text-fire">{t('How it works')}</a>
            <div className="flex rounded-full border border-line p-0.5 text-xs font-semibold" role="group" aria-label="Language / Idioma">
              {(['en', 'es'] as const).map((l) => (
                <button key={l} onClick={() => s.setLang(l)} aria-pressed={s.lang === l}
                  className={`min-h-9 rounded-full px-3 ${s.lang === l ? 'bg-[#2A1A0E] text-fire-soft' : 'text-soft hover:text-text'}`}>
                  {l === 'en' ? 'English' : 'Español'}
                </button>
              ))}
            </div>
          </div>
        </header>

        {/* Controls */}
        <section className="flex flex-wrap items-end gap-5">
          <div className="flex flex-col gap-2">
            <span className="label flex items-center">{t('Pick an area')} <InfoTip text={t('Choose a region, or draw your own box on the map. Every chart below updates for that area.')} /></span>
            <div className="flex flex-wrap gap-1.5">
              {REGIONS.map((r) => (
                <button key={r.id} onClick={() => s.setRegion(r.id)} aria-pressed={s.regionId === r.id}
                  className={`min-h-11 rounded-[10px] border px-4 text-sm font-medium transition ${s.regionId === r.id ? 'border-fire bg-[#2A1A0E] text-fire-soft' : 'border-line bg-panel text-soft hover:border-muted'}`}>
                  {t(r.name)}
                </button>
              ))}
              <button onClick={() => s.setDrawing(!s.drawing)} aria-pressed={s.drawing || s.regionId === 'custom'}
                className={`min-h-11 rounded-[10px] border px-4 text-sm font-medium transition ${s.drawing || s.regionId === 'custom' ? 'border-glow bg-[#1A1710] text-glow' : 'border-dashed border-muted bg-panel text-soft hover:border-glow'}`}>
                {s.drawing ? t('Cancel drawing') : t('+ Draw your own area')}
              </button>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <span className="label flex items-center">{t('Which satellite record?')} <InfoTip text={t("NASA's older MODIS satellites (since 2000) miss small fires. VIIRS (since 2012) sees far more. Adding them together fakes a jump in 2012. BRASA blends them so every year is comparable. Try switching to see the difference.")} /></span>
            <div className="flex flex-wrap gap-1 rounded-xl border border-line bg-panel p-1">
              {MODES.map((md) => (
                <button key={md.id} onClick={() => s.setMode(md.id)} aria-pressed={s.mode === md.id}
                  className={`flex min-h-11 flex-col items-start justify-center rounded-lg px-3.5 text-left transition ${s.mode === md.id ? 'bg-fire text-[#120A04]' : 'text-soft hover:text-text'}`}>
                  <span className="text-[13px] font-semibold leading-tight">{t(md.name)}</span>
                  <span className={`font-mono text-[10px] leading-tight ${s.mode === md.id ? 'text-[#3A1A06]' : 'text-muted'}`}>{t(md.sub)}</span>
                </button>
              ))}
            </div>
          </div>
        </section>

        <RightNow bbox={region.bbox} regionName={rName} typicalByMonth={seas.clim} recordByMonth={recordByMonth} />

        {/* Time bar */}
        <section className="panel flex flex-wrap items-center gap-4 px-4 py-3">
          <button onClick={() => s.setPlaying(!s.playing)} aria-label={s.playing ? t('Pause') : t('Play through time')}
            className="flex h-11 w-11 flex-none items-center justify-center rounded-full border border-fire bg-[#1E1610] text-fire">
            {s.playing
              ? <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="5" width="4" height="14" /><rect x="14" y="5" width="4" height="14" /></svg>
              : <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4l13 8-13 8z" /></svg>}
          </button>
          <div className="min-w-[120px] font-display text-2xl font-semibold">{MONTH_NAMES[m - 1]} {y}</div>
          <div className="flex min-w-0 flex-[1_1_300px] flex-col gap-0.5">
            <label htmlFor="scrub" className="font-mono text-[11px] text-muted">{t('Drag through time, or press space to play · ← → step months')}</label>
            <input id="scrub" type="range" min={0} max={months.length - 1} value={monthIdx}
              onChange={(e) => { s.setPlaying(false); s.setMonth(+e.target.value) }} className="h-7 w-full cursor-pointer" />
          </div>
        </section>

        {/* Plain-English headline */}
        <section className="panel border-[#3A2A1E] px-5 py-4">
          {s.mode === 'naive' && (
            <p className="mb-2 rounded-md bg-fire-soft px-3 py-1.5 text-[13px] font-semibold text-[#120A04]">{t('⚠ You are viewing the “both mixed” record: years after 2012 look worse than they were.')}</p>
          )}
          <p className="font-display text-xl font-semibold leading-snug sm:text-2xl">{headline.charAt(0).toUpperCase() + headline.slice(1)}</p>
          <p className="mt-1.5 text-sm text-soft">{subline}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button onClick={share} className="min-h-9 rounded-lg border border-line px-3 text-xs font-semibold text-soft hover:border-fire hover:text-fire">{copied ? t('✓ Link copied') : t('🔗 Share this view')}</button>
            <button onClick={download} className="min-h-9 rounded-lg border border-line px-3 text-xs font-semibold text-soft hover:border-fire hover:text-fire">⬇ {es ? `Descargar datos de ${rName} (CSV)` : `Download ${rName} data (CSV)`}</button>
          </div>
        </section>

        {/* Map + side */}
        <section className="flex flex-wrap gap-4">
          <div className="panel flex min-h-[460px] flex-[1_1_520px] flex-col gap-2 p-3">
            <div className="flex items-center justify-between px-1">
              <h2 className="flex items-center font-display text-base font-semibold">{t('Fire map')} · {MONTH_NAMES[m - 1]} {y}<InfoTip text={t('Each hexagon is ~250 km². Color shows how many days it was burning that month. Hover a hexagon for details, drag to move, scroll to zoom.')} /></h2>
              <div className="flex items-center gap-3">
                <div className="flex rounded-lg border border-line p-0.5 text-xs">
                  {(['fire', 'land'] as const).map((c) => (
                    <button key={c} onClick={() => s.setColorBy(c)} aria-pressed={s.colorBy === c}
                      className={`rounded-md px-2.5 py-1 font-semibold ${s.colorBy === c ? 'bg-[#2A1A0E] text-fire-soft' : 'text-soft'}`}>
                      {c === 'fire' ? t('Fire intensity') : t('What’s burning')}
                    </button>
                  ))}
                </div>
                <label className="flex cursor-pointer items-center gap-2 text-xs text-soft">
                  <input type="checkbox" checked={s.extruded} onChange={(e) => s.setExtruded(e.target.checked)} /> 3D
                </label>
              </div>
            </div>
            <div className="relative min-h-[420px] flex-1"><MapView ds={ds} bbox={region.bbox} /></div>
            {s.colorBy === 'land' ? (
              <div className="flex flex-wrap items-center gap-4 px-1 text-[11px] text-soft">
                {LAND.map((l) => <span key={l.key} className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: l.color }} />{t(l.name)}</span>)}
                <span className="text-muted">{t('brighter = more days burning')}</span>
              </div>
            ) : (
            <div className="flex items-center gap-2 px-1 font-mono text-[11px] text-muted">
              <span>{t('1 day')}</span>
              <div className="h-2 flex-1 rounded" style={{ background: `linear-gradient(90deg, ${[0.15, 0.4, 0.6, 0.8, 1].map(rampCss).join(',')})` }} />
              <span>{t('whole month burning')}</span>
            </div>
            )}
          </div>

          <div className="flex min-w-0 flex-[1_1_380px] flex-col gap-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="panel flex flex-col gap-1.5 p-4">
                <span className="label truncate">{rName}</span>
                <span className="font-display text-[32px] font-bold leading-none">{fmt(cur)}</span>
                <span className="flex items-center text-xs text-muted">{t('burning days this month')} <InfoTip text={t(UNIT_TIP)} /></span>
              </div>
              <div className="panel flex flex-col gap-1.5 p-4">
                <span className="label">{es ? `vs un ${MONTH_NAMES[m - 1]} normal` : `vs a normal ${MONTH_NAMES[m - 1]}`}</span>
                <span className={`font-display text-[32px] font-bold leading-none ${extreme ? 'text-glow' : zc >= 1 ? 'text-fire-soft' : zc <= -1 ? 'text-[#9CC0FF]' : ''}`}>
                  {typical[m - 1] > 0 ? `${cur >= typical[m - 1] ? '+' : '−'}${Math.round(Math.abs(cur / typical[m - 1] - 1) * 100)}%` : '–'}
                </span>
                <span className="text-xs text-muted">{es ? 'normal' : 'typical'} {fmt(typical[m - 1])} · {rank.rank ? `#${rank.rank} ${es ? 'de' : 'of'} ${rank.of}` : ''}</span>
              </div>
              <div className="panel flex flex-col gap-1.5 p-4">
                <span className="label">{t('Status')}</span>
                <span><span className={`mt-1 inline-block rounded-full px-3 py-1.5 text-sm font-semibold ${status.c}`}>{status.t}</span></span>
                <span className="text-xs text-muted">{es ? 'Temporada' : 'Season'} {MONTH_NAMES[seas.start]}–{MONTH_NAMES[seas.end]}, {es ? 'pico' : 'peak'} {MONTH_NAMES[seas.peak]}</span>
              </div>
            </div>

            <div className="panel flex flex-col gap-2 p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="flex items-center font-display text-base font-semibold">{t('Burning per year')} · {rName}<InfoTip text={t('Total burning days each year. Switch the satellite record above to see how mixing satellites fakes a jump in 2012 and 2018.')} /></h2>
                <span className="font-mono text-[11px] text-muted">{t('click a year to jump')}</span>
              </div>
              <AnnualChart months={months} modis={series.modis} naive={series.naive} harm={series.harm} lo={series.lo} hi={series.hi} mode={s.mode} />
              <p className={`rounded-lg px-3 py-2 text-[13px] leading-relaxed ${note.tone === 'warn' ? 'bg-fire-soft text-[#120A04]' : 'bg-[#1B1F27] text-soft'}`}>{t(note.text)}</p>
            </div>

            <div className="panel flex flex-col gap-3 p-4">
              <h2 className="flex items-center font-display text-base font-semibold">{t('Fire season')} · {rName}<InfoTip text={t("The average amount of burning in each calendar month. Highlighted letters are the fire season: the months with at least 40% of the peak month's burning.")} /></h2>
              <p className="text-[13px] text-muted">{t(region.blurb)}. {t('Average harmonized activity per month, 2003–2025.')}</p>
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

        <RecordTracker months={months} harm={series.harm} bbox={region.bbox} regionName={rName} />

        <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <WhatsBurning months={months} series={series} monthIdx={monthIdx} regionName={rName} />
          <SeasonShift months={months} harm={series.harm} peakMonth={seas.peak} regionName={rName} />
        </section>

        {/* Calendar */}
        <section className="panel flex flex-col gap-2 p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="flex items-center font-display text-base font-semibold">{t('Burning calendar')} · {rName}<InfoTip text={t('Each square is one month. Brighter means more burning. A yellow outline marks a month far above its normal level for that time of year. Click any square to jump there.')} /></h2>
            <div className="flex flex-wrap gap-4 text-xs text-soft">
              <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-4 rounded-sm border-[1.5px] border-glow" /> {t('Extreme month (far above its normal)')}</span>
              <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-4 rounded-sm border-2 border-white" /> {t('Selected')}</span>
            </div>
          </div>
          <div className="overflow-x-auto"><div className="min-w-[560px]"><Calendar months={months} values={values} z={z} /></div></div>
        </section>

        {/* Validation + method */}
        <section id="method" className="flex flex-wrap gap-4">
          <div className="panel flex flex-[1_1_420px] flex-col gap-2 p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="flex items-center font-display text-base font-semibold">{t('Does the blending work?')}<InfoTip text={t('We hid each year from 2012 to 2025, predicted it from the old MODIS satellite alone, then compared with what VIIRS really saw. Close bars mean the blend can be trusted for the years before VIIRS existed.')} /></h2>
              <span className="font-mono text-xs text-glow">r = {v.r_annual.toFixed(3)} · {(v.mape_annual * 100).toFixed(1)}% {t('yearly error')}</span>
            </div>
            <p className="text-[13px] text-muted">{t('Each year from 2012 to 2025 was hidden, predicted from MODIS with a model fitted on the other years, then compared with what VIIRS really saw.')}</p>
            <ValidationChart v={v} />
            <div className="flex flex-wrap gap-4 text-xs text-soft">
              <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-fire" /> {t('VIIRS observed')}</span>
              <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-cool" /> {t('Predicted from MODIS')}</span>
            </div>
          </div>
          <div className="panel flex flex-[1_1_420px] flex-col gap-3 p-4 text-[13px] leading-relaxed text-soft">
            <h2 className="font-display text-base font-semibold text-text">{t('How BRASA harmonizes the record')}</h2>
            <ol className="flex list-decimal flex-col gap-1.5 pl-5">
              <li><b className="text-text">{t('Clean.')}</b> {t('Vegetation fires only; MODIS confidence ≥ 30, VIIRS nominal or high. Volcanoes, gas flares and offshore sources removed.')}</li>
              <li><b className="text-text">{t('Grid.')}</b> {t('Every detection goes into an equal-area H3 hexagon (~250 km²). We count fire-active hexagon-days, which removes most of the 1 km vs 375 m pixel difference.')}</li>
              <li><b className="text-text">{t('Calibrate.')}</b> {t('On 2012–2025, when both sensors flew, fit')} log(VIIRS) = a<sub>month</sub> + b·log(MODIS). b = {ds.meta.models.modis_to_viirs.b.toFixed(2)}.</li>
              <li><b className="text-text">{t('Adjust locally.')}</b> {t('Fire sizes differ from place to place, so each ~12,000 km² area learns a small correction from the overlap years, pulled toward the national formula where fires are rare.')}</li>
              <li><b className="text-text">{t('Extend.')}</b> {t('Before 2012, MODIS is scaled to VIIRS-equivalent (Terra alone before Aqua in mid-2002). From 2012, VIIRS is used directly; NOAA-20 fills gaps.')}</li>
              <li><b className="text-text">{t('Validate.')}</b> {t('Leave-one-year-out test, shown on the left.')}</li>
              <li><b className="text-text">{t('Classify.')}</b> {t('Each detection is matched to NASA’s MODIS land cover map (MCD12Q1) for its year to separate cropland burning from forest and grassland fires.')}</li>
            </ol>
            <p className="text-xs text-muted">Data: NASA FIRMS MODIS C6.1 and VIIRS 375 m (S-NPP, NOAA-20) active fire archives, {fmt(5669609)} detections · NASA MODIS MCD12Q1 land cover · NASA FIRMS near-real-time VIIRS · NASA GIBS VIIRS Black Marble basemap.</p>
          </div>
        </section>

        <Story months={months} />
        <Welcome />
        {ds.robustness && <section id="accuracy"><Accuracy r={ds.robustness} /></section>}

        <footer className="text-center text-xs text-muted">{t('BRASA · NASA Space Apps Challenge 2026 · Harmonization of MODIS and VIIRS Hot Spots · Demo coverage: Argentina; the pipeline runs on NASA FIRMS data for any country')}</footer>
      </div>
    </div>
  )
}
