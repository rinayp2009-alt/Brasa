import { useEffect, useMemo, useState } from 'react'
import ReactECharts from 'echarts-for-react'
import { cellToLatLng } from 'h3-js'
import type { BBox } from '../data'
import { MONTH_NAMES, fmt, inBox, ym } from '../data'
import InfoTip from './InfoTip'
import { useT } from '../i18n'
import { useStore } from '../store'

interface Ytd {
  ok: boolean
  error?: string
  year?: number
  to?: string
  months?: Record<string, [string, number][]>
}

interface Props {
  months: string[]
  harm: number[]
  bbox: BBox | null
  regionName: string
}

let cache: Promise<Ytd> | null = null
const loadYtd = () => (cache ||= fetch('/api/ytd').then((r) => r.json()).catch(() => ({ ok: false, error: 'offline' })))

const FULL_ES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const FULL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

/** cumulative value at fractional month x (0..12) from 12 monthly values */
function cumAt(vals: number[], x: number) {
  let c = 0
  for (let k = 0; k < 12; k++) {
    if (x >= k + 1) c += vals[k]
    else { c += vals[k] * Math.max(0, x - k); break }
  }
  return c
}

export default function RecordTracker({ months, harm, bbox, regionName }: Props) {
  const t = useT()
  const es = useStore((s) => s.lang) === 'es'
  const [ytd, setYtd] = useState<Ytd | null>(null)
  useEffect(() => { loadYtd().then(setYtd) }, [])

  // harmonized monthly values per full year
  const years = useMemo(() => {
    const out: Record<number, number[]> = {}
    months.forEach((k, i) => { const { y, m } = ym(k); if (y >= 2001) (out[y] ||= new Array(12).fill(0))[m - 1] = harm[i] })
    return out
  }, [months, harm])
  const yearList = Object.keys(years).map(Number)

  // this year's monthly values inside the region, from the live archive
  const live = useMemo(() => {
    if (!ytd?.ok || !ytd.months || !ytd.to || !ytd.year) return null
    const vals = new Array(12).fill(0)
    for (const [mk, rows] of Object.entries(ytd.months)) {
      const mo = +mk.slice(5, 7) - 1
      for (const [hex, n] of rows) {
        const [lat, lon] = cellToLatLng(hex)
        if (inBox(lat, lon, bbox)) vals[mo] += n
      }
    }
    const end = new Date(`${ytd.to}T12:00:00Z`)
    const mo = end.getUTCMonth()
    const dim = new Date(Date.UTC(end.getUTCFullYear(), mo + 1, 0)).getUTCDate()
    const x = mo + end.getUTCDate() / dim // how far through the year the data reaches
    return { vals, x, year: ytd.year, to: ytd.to, mo }
  }, [ytd, bbox])

  const latestYear = Math.max(...yearList)
  const x = live?.x ?? 12

  // compare with every past year at the same point in the calendar
  const stats = useMemo(() => {
    if (!live) return null
    const now = cumAt(live.vals, x)
    const past = yearList.map((y) => ({ y, v: cumAt(years[y], x), total: cumAt(years[y], 12) }))
    const rank = past.filter((p) => p.v > now).length + 1
    const sorted = [...past].sort((a, b) => b.v - a.v)
    // projection: add what typically burns in the rest of the year (median share remaining)
    const shares = past.filter((p) => p.v > 0).map((p) => p.total / p.v).sort((a, b) => a - b)
    const q = (f: number) => shares[Math.min(shares.length - 1, Math.floor(f * shares.length))] || 1
    const proj = { lo: now * q(0.25), mid: now * q(0.5), hi: now * q(0.75) }
    const totals = past.map((p) => p.total).sort((a, b) => b - a)
    const projRank = totals.filter((t) => t > proj.mid).length + 1
    return { now, rank, of: past.length + 1, ahead: sorted[0], proj, projRank }
  }, [live, x, years, yearList])

  const series = [
    ...yearList.map((y) => {
      let c = 0
      const pts = [[0, 0], ...years[y].map((v, k) => { c += v; return [k + 1, c] })]
      const isLatest = !live && y === latestYear
      return {
        type: 'line', name: String(y), data: pts, showSymbol: false, silent: false,
        lineStyle: { width: isLatest ? 2.5 : 1, color: isLatest ? '#FF8A3D' : y === 2020 ? '#9CC0FF' : '#3A404C' },
        emphasis: { focus: 'series', lineStyle: { width: 2.5, color: '#E8E6E1' } },
        z: isLatest ? 5 : y === 2020 ? 3 : 1,
      }
    }),
    ...(live ? [{
      type: 'line', name: String(live.year),
      data: (() => { let c = 0; const pts: number[][] = [[0, 0]]; for (let k = 0; k < live.mo; k++) { c += live.vals[k]; pts.push([k + 1, c]) } pts.push([x, cumAt(live.vals, x)]); return pts })(),
      showSymbol: false, lineStyle: { width: 3.5, color: '#FF8A3D', shadowBlur: 12, shadowColor: 'rgba(255,138,61,0.6)' }, z: 10,
      endLabel: { show: true, formatter: String(live.year), color: '#FF8A3D', fontFamily: 'IBM Plex Mono', fontWeight: 'bold' },
    }] : []),
  ]

  const option = {
    animationDuration: 600,
    grid: { left: 52, right: 44, top: 12, bottom: 26 },
    tooltip: {
      trigger: 'item', backgroundColor: '#0B0D10', borderColor: '#232832',
      textStyle: { color: '#E8E6E1', fontFamily: 'IBM Plex Mono', fontSize: 12 },
      formatter: (p: { seriesName: string; data: number[] }) => es
        ? `${p.seriesName}<br/>${fmt(p.data[1])} días de quema ${p.data[0] >= 12 ? 'al fin del año' : `a fin de ${MONTH_NAMES[Math.max(0, Math.ceil(p.data[0]) - 1)]}`}`
        : `${p.seriesName}<br/>${fmt(p.data[1])} burning days by ${p.data[0] >= 12 ? 'year end' : `end of ${MONTH_NAMES[Math.max(0, Math.ceil(p.data[0]) - 1)]}`}`,
    },
    xAxis: {
      type: 'value', min: 0, max: 12, interval: 1, splitLine: { lineStyle: { color: '#1B1F27' } },
      axisLabel: { color: '#9AA0AA', fontFamily: 'IBM Plex Mono', fontSize: 10, formatter: (v: number) => (v < 12 ? MONTH_NAMES[v] : '') },
    },
    yAxis: { type: 'value', splitLine: { lineStyle: { color: '#1B1F27' } },
      axisLabel: { color: '#9AA0AA', fontFamily: 'IBM Plex Mono', fontSize: 10, formatter: (v: number) => (v >= 1000 ? `${Math.round(v / 1000)}k` : v) } },
    series,
  }

  const ord = (n: number) => (n === 1 ? t('the highest') : `#${n}`)
  const tone = stats && stats.rank <= 3 ? 'text-glow' : stats && stats.rank <= 8 ? 'text-fire-soft' : 'text-text'
  const verdict = !stats ? null
    : stats.projRank <= 3 ? t('On track for one of the worst years on record')
    : stats.projRank <= 8 ? t('On track for an above-normal year')
    : stats.projRank >= 20 ? t('On track for a quieter-than-normal year')
    : t('On track for a fairly typical year')

  return (
    <section className="panel flex flex-col gap-3 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="flex items-center font-display text-base font-semibold">{t('Is this year heading for a record?')} · {regionName}<InfoTip text={t("Each grey line is one year from 2001 to 2025, adding up its burning month by month. The bright orange line is this year, built from NASA's latest VIIRS NOAA-20 data. If orange is near the top, this year is running hot. 2020 is shown in blue for reference.")} /></h2>
        <span className="font-mono text-[11px] text-muted">{t('running total of burning days · grey = 2001–2025 ·')} <span className="text-[#9CC0FF]">{t('blue = 2020')}</span></span>
      </div>

      {stats && live ? (
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg bg-[#1B1F27] px-4 py-3">
          <div className="flex flex-col">
            <span className="label">{es ? `${live.year} hasta ahora (al ${live.to})` : `${live.year} so far (to ${live.to})`}</span>
            <span className="font-display text-2xl font-bold">{fmt(stats.now)} <span className="text-sm font-normal text-muted">{t('burning days')}</span></span>
          </div>
          <div className="flex flex-col">
            <span className="label">{t('vs the same date in past years')}</span>
            <span className={`font-display text-2xl font-bold ${tone}`}>{ord(stats.rank)} <span className="text-sm font-normal text-muted">{es ? 'de' : 'of'} {stats.of} {es ? 'años' : 'years'}</span></span>
          </div>
          <div className="flex flex-col">
            <span className="label">{t('Projected full year')}</span>
            <span className="font-display text-2xl font-bold">{fmt(stats.proj.mid)} <span className="text-sm font-normal text-muted">({fmt(stats.proj.lo)}–{fmt(stats.proj.hi)})</span></span>
          </div>
          <span className={`rounded-full px-3 py-1.5 text-sm font-semibold ${stats.projRank <= 3 ? 'bg-glow text-ink' : stats.projRank <= 8 ? 'bg-[#2A1A0E] text-fire-soft' : 'bg-[#121B2C] text-[#9CC0FF]'}`}>{verdict}</span>
        </div>
      ) : (
        <p className="rounded-lg bg-[#1B1F27] px-4 py-3 text-sm text-muted">
          {!ytd ? t('Fetching this year’s NASA fire data so far…') : es ? `Los datos en vivo de este año no están disponibles ahora; se resalta ${latestYear}.` : `This year’s live data is unavailable right now, so ${latestYear} is highlighted instead.`}
        </p>
      )}

      <ReactECharts option={option} notMerge style={{ height: 300, width: '100%' }} />
      <p className="text-[11px] text-muted">
        {es
          ? `${live ? `${live.year}: NASA FIRMS VIIRS NOAA-20 (archivo de calidad científica y luego casi en tiempo real), con la misma limpieza y filtro de antorchas que el registro de 25 años. ` : ''}La proyección suma lo que suele quemarse después de ${live ? `${new Date(`${live.to}T12:00:00Z`).getUTCDate()} de ${FULL_ES[live.mo]}` : 'esta fecha'}, con la mitad central de los años pasados como rango. Es una guía, no un pronóstico.`
          : `${live ? `${live.year}: NASA FIRMS VIIRS NOAA-20 (science-quality archive, then near-real-time), same cleaning and gas-flare filter as the 25-year record. ` : ''}Projection adds what usually burns after ${live ? `${FULL[live.mo]} ${new Date(`${live.to}T12:00:00Z`).getUTCDate()}` : 'this date'}, using the middle half of past years as the range. It is a guide, not a forecast.`}
      </p>
    </section>
  )
}
