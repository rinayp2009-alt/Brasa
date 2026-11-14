import ReactECharts from 'echarts-for-react'
import type { Mode } from '../data'
import { fmt, ym } from '../data'
import { useStore } from '../store'

interface Props {
  months: string[]
  modis: number[]
  naive: number[]
  harm: number[]
  lo: number[]
  hi: number[]
  mode: Mode
}

function annual(months: string[], v: number[]) {
  const out = new Map<number, number>()
  months.forEach((k, i) => { const y = ym(k).y; out.set(y, (out.get(y) || 0) + v[i]) })
  return out
}

export default function AnnualChart({ months, modis, naive, harm, lo, hi, mode }: Props) {
  const { monthIdx, setMonth, setPlaying, lang } = useStore()
  const es = lang === 'es'
  const years = Array.from(annual(months, harm).keys()).filter((y) => y >= 2001)
  const A = { modis: annual(months, modis), naive: annual(months, naive), harm: annual(months, harm), lo: annual(months, lo), hi: annual(months, hi) }
  const selYear = months[monthIdx] ? ym(months[monthIdx]).y : null

  const barColor = (y: number, base: string) => (y === selYear ? '#FFE08A' : base)
  const series: object[] = []
  if (mode === 'naive') {
    series.push({ name: 'MODIS', type: 'bar', stack: 'a', data: years.map((y) => ({ value: Math.round(A.modis.get(y)!), itemStyle: { color: barColor(y, '#6E9BF2') } })) })
    series.push({ name: es ? 'Extra de VIIRS' : 'Extra from VIIRS', type: 'bar', stack: 'a', data: years.map((y) => ({ value: Math.round(A.naive.get(y)! - A.modis.get(y)!), itemStyle: { color: barColor(y, '#FF8A3D'), borderRadius: [3, 3, 0, 0] } })) })
  } else if (mode === 'modis') {
    series.push({ name: es ? 'Solo MODIS' : 'MODIS only', type: 'bar', data: years.map((y) => ({ value: Math.round(A.modis.get(y)!), itemStyle: { color: barColor(y, '#6E9BF2'), borderRadius: [3, 3, 0, 0] } })) })
  } else {
    series.push({ name: es ? 'Armonizado' : 'Harmonized', type: 'bar', data: years.map((y) => ({ value: Math.round(A.harm.get(y)!), itemStyle: { color: barColor(y, y < 2012 ? '#E0742F' : '#FF8A3D'), borderRadius: [3, 3, 0, 0] } })) })
    // 90% uncertainty whiskers on years estimated from MODIS
    series.push({
      name: es ? 'Rango 90%' : '90% range', type: 'custom', silent: true, z: 5,
      renderItem: (_: unknown, api: { value: (i: number) => number; coord: (p: number[]) => number[] }) => {
        const x = api.value(0), l = api.value(1), h = api.value(2)
        if (l === h) return null
        const a = api.coord([x, l]), b = api.coord([x, h])
        return { type: 'group', children: [
          { type: 'line', shape: { x1: a[0], y1: a[1], x2: b[0], y2: b[1] }, style: { stroke: '#FFE08A', lineWidth: 1.2 } },
          { type: 'line', shape: { x1: a[0] - 4, y1: a[1], x2: a[0] + 4, y2: a[1] }, style: { stroke: '#FFE08A', lineWidth: 1.2 } },
          { type: 'line', shape: { x1: b[0] - 4, y1: b[1], x2: b[0] + 4, y2: b[1] }, style: { stroke: '#FFE08A', lineWidth: 1.2 } },
        ] }
      },
      data: years.map((y, i) => [i, A.lo.get(y)!, A.hi.get(y)!]),
    })
  }

  const marks = mode === 'harm' ? [] : [
    { xAxis: String(2012), label: { formatter: es ? 'llega VIIRS' : 'VIIRS joins', color: '#C4C7CD' } },
    { xAxis: String(2018), label: { formatter: es ? 'llega NOAA-20' : 'NOAA-20 joins', color: '#C4C7CD' } },
  ]
  if (series[0]) (series[0] as Record<string, unknown>).markLine = {
    silent: true, symbol: 'none', lineStyle: { color: '#6B7280', type: 'dashed' },
    label: { position: 'insideEndTop', fontFamily: 'IBM Plex Mono', fontSize: 10 }, data: marks,
  }

  const option = {
    animationDurationUpdate: 500,
    grid: { left: 52, right: 10, top: 18, bottom: 26 },
    tooltip: {
      trigger: 'axis', axisPointer: { type: 'shadow' }, backgroundColor: '#0B0D10', borderColor: '#232832',
      textStyle: { color: '#E8E6E1', fontFamily: 'IBM Plex Mono', fontSize: 12 },
      valueFormatter: (v: number) => fmt(v),
    },
    xAxis: { type: 'category', data: years.map(String), axisLine: { lineStyle: { color: '#232832' } }, axisTick: { show: false },
      axisLabel: { color: '#9AA0AA', fontFamily: 'IBM Plex Mono', fontSize: 10, interval: 4 } },
    yAxis: { type: 'value', splitLine: { lineStyle: { color: '#1B1F27' } },
      axisLabel: { color: '#9AA0AA', fontFamily: 'IBM Plex Mono', fontSize: 10, formatter: (v: number) => (v >= 1000 ? `${v / 1000}k` : v) } },
    series,
  }

  return (
    <ReactECharts option={option} notMerge style={{ height: 220, width: '100%' }}
      onEvents={{ click: (p: { dataIndex: number }) => {
        const y = years[p.dataIndex]
        const m = months[monthIdx] ? ym(months[monthIdx]).m : 9
        const idx = months.indexOf(`${y}-${String(m).padStart(2, '0')}`)
        if (idx >= 0) { setPlaying(false); setMonth(idx) }
      } }} />
  )
}
