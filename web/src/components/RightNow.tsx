import { useEffect, useMemo } from 'react'
import { cellToLatLng } from 'h3-js'
import type { BBox } from '../data'
import { MONTH_NAMES, fmt, inBox } from '../data'
import { useStore } from '../store'

interface Props {
  bbox: BBox | null
  regionName: string
  typicalByMonth: number[] // harmonized typical monthly activity for this region, Jan..Dec
  recordByMonth: number[]
}

export default function RightNow({ bbox, regionName, typicalByMonth, recordByMonth }: Props) {
  const { live, setLive, showLive, setShowLive } = useStore()

  useEffect(() => {
    if (live) return
    fetch('/api/now').then((r) => r.json()).then(setLive)
      .catch(() => setLive({ ok: false, error: 'the live NASA feed is not connected yet' }))
  }, [live, setLive])

  const stats = useMemo(() => {
    if (!live?.ok || !live.cellDays) return null
    let n = 0
    for (const [hex] of live.cellDays) {
      const [lat, lon] = cellToLatLng(hex)
      if (inBox(lat, lon, bbox)) n++
    }
    const end = new Date(`${live.to}T12:00:00Z`)
    const mo = end.getUTCMonth()
    const daysInMonth = new Date(Date.UTC(end.getUTCFullYear(), mo + 1, 0)).getUTCDate()
    const days = live.days || 7
    const typical = (typicalByMonth[mo] * days) / daysInMonth
    const record = (recordByMonth[mo] * days) / daysInMonth
    const ratio = typical > 0 ? n / typical : 0
    return { n, typical, record, ratio, mo }
  }, [live, bbox, typicalByMonth, recordByMonth])

  const status = !stats ? null
    : stats.n >= stats.record ? { t: 'Record pace', c: 'bg-[#FF463C] text-white' }
    : stats.ratio >= 2 ? { t: 'Extreme activity', c: 'bg-glow text-ink' }
    : stats.ratio >= 1.25 ? { t: 'Above normal', c: 'bg-[#2A1A0E] text-fire-soft' }
    : stats.ratio <= 0.6 ? { t: 'Quieter than normal', c: 'bg-[#121B2C] text-[#9CC0FF]' }
    : { t: 'Typical for the season', c: 'bg-[#1B1F27] text-soft' }

  return (
    <section className="panel flex flex-wrap items-center gap-x-6 gap-y-3 border-[#3A2A1E] px-4 py-3" style={{ background: 'linear-gradient(90deg, #1A120D, #12151B 60%)' }}>
      <div className="flex items-center gap-2">
        <span className="relative flex h-3 w-3">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#FF463C] opacity-60" />
          <span className="relative inline-flex h-3 w-3 rounded-full bg-[#FF463C]" />
        </span>
        <span className="font-display text-base font-semibold">Right now</span>
        <span className="label">{regionName}</span>
      </div>

      {!live && <span className="text-sm text-muted">Fetching the last 7 days from NASA FIRMS…</span>}
      {live && !live.ok && <span className="text-sm text-muted">Live data unavailable: {live.error?.includes('FIRMS_MAP_KEY') ? 'the NASA FIRMS key is not set up yet' : live.error?.slice(0, 80)}.</span>}

      {stats && status && (
        <>
          <div className="flex items-baseline gap-2">
            <span className="font-display text-2xl font-bold">{fmt(stats.n)}</span>
            <span className="text-xs text-muted">fire-active cell-days, {live!.from} → {live!.to}</span>
          </div>
          <div className="text-sm text-soft">
            Typical {MONTH_NAMES[stats.mo]} week: <b className="text-text">{fmt(stats.typical)}</b>
            {stats.typical > 0 && <> · <b className={stats.ratio >= 1.25 ? 'text-fire-soft' : 'text-text'}>{stats.ratio >= 1 ? '+' : '−'}{Math.round(Math.abs(stats.ratio - 1) * 100)}%</b></>}
          </div>
          <span className={`rounded-full px-3 py-1 text-sm font-semibold ${status.c}`}>{status.t}</span>
          <label className="ml-auto flex cursor-pointer items-center gap-2 text-xs text-soft">
            <input type="checkbox" checked={showLive} onChange={(e) => setShowLive(e.target.checked)} /> Show live fires on map
          </label>
          <span className="w-full text-[11px] text-muted">NASA FIRMS VIIRS NOAA-20 near-real-time, compared with BRASA’s harmonized 2003–2025 record for the same month.</span>
        </>
      )}
    </section>
  )
}
