import ReactECharts from 'echarts-for-react'
import { MONTH_NAMES, fmt, ym } from '../data'
import { ECHARTS_RAMP } from '../colors'
import { useStore } from '../store'

interface Props {
  months: string[]
  values: number[]
  z: number[]
}

export default function Calendar({ months, values, z }: Props) {
  const { monthIdx, setMonth, setPlaying } = useStore()
  const years = Array.from(new Set(months.map((k) => ym(k).y)))
  const max = Math.max(...values)

  const pos = values.filter((v) => v > 0).sort((a, b) => a - b)
  const lowCut = Math.log1p(pos[Math.floor(pos.length * 0.03)] || 0)
  const cells = months.map((k, i) => {
    const { y, m } = ym(k)
    const anomalous = z[i] >= 2 && values[i] > 0
    return {
      value: [m - 1, years.indexOf(y), Math.log1p(values[i]), i],
      itemStyle: i === monthIdx ? { borderColor: '#FFFFFF', borderWidth: 2.5 } : anomalous ? { borderColor: '#FFE08A', borderWidth: 2 } : undefined,
    }
  })
  const sel = months[monthIdx] ? ym(months[monthIdx]) : null

  const option = {
    animationDuration: 300,
    grid: { left: 44, right: 8, top: 22, bottom: 8 },
    tooltip: {
      backgroundColor: '#0B0D10', borderColor: '#232832', textStyle: { color: '#E8E6E1', fontFamily: 'IBM Plex Mono', fontSize: 12 },
      formatter: (p: { value: number[] }) => {
        const i = p.value[p.value.length - 1]
        const flag = z[i] >= 2 ? ' · <b style="color:#FFE08A">extreme</b>' : z[i] >= 1 ? ' · above normal' : ''
        return `${MONTH_NAMES[ym(months[i]).m - 1]} ${ym(months[i]).y}<br/>${fmt(values[i])} fire-active days${flag}`
      },
    },
    xAxis: {
      type: 'category', data: MONTH_NAMES, position: 'top', splitArea: { show: false },
      axisLine: { show: false }, axisTick: { show: false },
      axisLabel: { color: '#9AA0AA', fontFamily: 'IBM Plex Mono', fontSize: 11 },
    },
    yAxis: {
      type: 'category', data: years, inverse: true, axisLine: { show: false }, axisTick: { show: false },
      axisLabel: {
        fontFamily: 'IBM Plex Mono', fontSize: 10,
        color: (v: string) => (sel && +v === sel.y ? '#FFE08A' : '#9AA0AA'),
      },
    },
    visualMap: { show: false, min: lowCut, max: Math.log1p(max), seriesIndex: 0, dimension: 2, inRange: { color: ECHARTS_RAMP } },
    series: [
      {
        type: 'heatmap', data: cells, itemStyle: { borderColor: '#0B0D10', borderWidth: 2, borderRadius: 3 },
        emphasis: { itemStyle: { borderColor: '#FFFFFF', borderWidth: 2 } },
      },
    ].filter(Boolean),
  }

  return (
    <ReactECharts
      option={option}
      notMerge
      style={{ height: years.length * 15 + 34, width: '100%' }}
      onEvents={{ click: (p: { value: number[] }) => { setPlaying(false); setMonth(p.value[p.value.length - 1]) } }}
    />
  )
}
