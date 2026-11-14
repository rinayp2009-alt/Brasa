import { useMemo } from 'react'
import ReactECharts from 'echarts-for-react'
import { MONTH_NAMES, ym } from '../data'
import InfoTip from './InfoTip'

interface Props {
  months: string[]
  harm: number[]
  peakMonth: number // climatological peak, 0-11
  regionName: string
}

// For each year, look at the 12 months centred on the usual peak and find when 10%, 50%
// and 90% of that year's burning had happened (interpolated within months).
function seasonTiming(months: string[], harm: number[], peakMonth: number) {
  const startMonth = (peakMonth + 6) % 12 // window opens 6 months before the peak
  const idx = new Map(months.map((k, i) => [k, i]))
  const out: { year: number; start: number; mid: number; end: number; total: number }[] = []
  for (let y = 2000; y <= 2025; y++) {
    const vals: number[] = []
    let ok = true
    for (let k = 0; k < 12; k++) {
      const mm = (startMonth + k) % 12
      const yy = y + Math.floor((startMonth + k) / 12)
      const i = idx.get(`${yy}-${String(mm + 1).padStart(2, '0')}`)
      if (i === undefined) { ok = false; break }
      vals.push(harm[i])
    }
    if (!ok) continue
    const total = vals.reduce((a, b) => a + b, 0)
    if (total <= 0) continue
    const at = (q: number) => {
      let cum = 0
      for (let k = 0; k < 12; k++) {
        if (cum + vals[k] >= q * total) return k + (q * total - cum) / (vals[k] || 1)
        cum += vals[k]
      }
      return 12
    }
    // label the season by the calendar year its peak month falls in
    const peakYear = y + Math.floor((startMonth + 6) / 12)
    out.push({ year: peakYear, start: at(0.1), mid: at(0.5), end: at(0.9), total })
  }
  return { rows: out, startMonth }
}

function slopePerDecade(xs: number[], ys: number[]) {
  const n = xs.length
  const mx = xs.reduce((a, b) => a + b, 0) / n, my = ys.reduce((a, b) => a + b, 0) / n
  let num = 0, den = 0
  xs.forEach((x, i) => { num += (x - mx) * (ys[i] - my); den += (x - mx) ** 2 })
  return den ? (num / den) * 10 : 0
}

export default function SeasonShift({ months, harm, peakMonth, regionName }: Props) {
  const { rows, startMonth } = useMemo(() => seasonTiming(months, harm, peakMonth), [months, harm, peakMonth])
  const DAYS = 30.44
  const startTrend = slopePerDecade(rows.map((r) => r.year), rows.map((r) => r.start * DAYS))
  const lenTrend = slopePerDecade(rows.map((r) => r.year), rows.map((r) => (r.end - r.start) * DAYS))
  const label = (v: number) => MONTH_NAMES[(startMonth + Math.floor(v)) % 12]

  const option = {
    grid: { left: 44, right: 12, top: 8, bottom: 26 },
    tooltip: {
      backgroundColor: '#0B0D10', borderColor: '#232832', textStyle: { color: '#E8E6E1', fontFamily: 'IBM Plex Mono', fontSize: 12 },
      formatter: (p: { data: number[] }) => {
        const r = rows[p.data[0]]
        return r ? `${r.year}: ${label(r.start)} → ${label(r.end)}<br/>half of the burning done by ${label(r.mid)}` : ''
      },
    },
    xAxis: {
      type: 'value', min: 0, max: 12, interval: 1, splitLine: { lineStyle: { color: '#1B1F27' } },
      axisLabel: { color: '#9AA0AA', fontFamily: 'IBM Plex Mono', fontSize: 10, formatter: (v: number) => (v < 12 ? MONTH_NAMES[(startMonth + v) % 12] : '') },
    },
    yAxis: { type: 'category', data: rows.map((r) => String(r.year)), inverse: true, axisTick: { show: false }, axisLine: { show: false },
      axisLabel: { color: '#9AA0AA', fontFamily: 'IBM Plex Mono', fontSize: 9, interval: 4 } },
    series: [{
      type: 'custom',
      data: rows.map((r, i) => [i, r.start, r.mid, r.end]),
      renderItem: (_: unknown, api: { value: (i: number) => number; coord: (p: number[]) => number[]; size: (p: number[]) => number[] }) => {
        const i = api.value(0)
        const a = api.coord([api.value(1), i]), m = api.coord([api.value(2), i]), b = api.coord([api.value(3), i])
        const h = Math.max(3, api.size([0, 1])[1] * 0.5)
        return { type: 'group', children: [
          { type: 'rect', shape: { x: a[0], y: a[1] - h / 2, width: Math.max(1, b[0] - a[0]), height: h, r: h / 2 }, style: { fill: 'rgba(255,138,61,0.55)' } },
          { type: 'circle', shape: { cx: m[0], cy: m[1], r: Math.max(2, h * 0.55) }, style: { fill: '#FFE08A' } },
        ] }
      },
    }],
  }

  const dir = (v: number, early: string, late: string) => (Math.abs(v) < 2 ? 'no clear change' : `${Math.round(Math.abs(v))} days ${v < 0 ? early : late} per decade`)

  return (
    <div className="panel flex flex-col gap-2 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="flex items-center font-display text-base font-semibold">Is fire season shifting? · {regionName}<InfoTip text="Each bar is one year's fire season, from when 10% of that year's burning had happened to when 90% had. The dot is the halfway point. Bars getting longer means a longer fire season." /></h2>
        <span className="font-mono text-[11px] text-muted">bar = 10%–90% of each year’s burning · dot = halfway</span>
      </div>
      <div className="flex flex-wrap gap-3 text-sm">
        <span className="rounded-lg bg-[#1B1F27] px-3 py-1.5 text-soft">Start: <b className={startTrend < -2 ? 'text-fire-soft' : 'text-text'}>{dir(startTrend, 'earlier', 'later')}</b></span>
        <span className="rounded-lg bg-[#1B1F27] px-3 py-1.5 text-soft">Length: <b className={lenTrend > 2 ? 'text-fire-soft' : 'text-text'}>{dir(lenTrend, 'shorter', 'longer')}</b></span>
      </div>
      <ReactECharts option={option} notMerge style={{ height: 300, width: '100%' }} />
      <p className="text-[11px] text-muted">Trend is a straight-line fit over {rows[0]?.year}–{rows[rows.length - 1]?.year} on monthly harmonized data, so treat it as a first look, not a final answer.</p>
    </div>
  )
}

export { ym }
