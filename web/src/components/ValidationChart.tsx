import ReactECharts from 'echarts-for-react'
import type { Validation } from '../data'
import { fmt } from '../data'
import { useT } from '../i18n'

export default function ValidationChart({ v }: { v: Validation }) {
  const t = useT()
  const option = {
    grid: { left: 48, right: 10, top: 14, bottom: 26 },
    tooltip: { trigger: 'axis', backgroundColor: '#0B0D10', borderColor: '#232832', textStyle: { color: '#E8E6E1', fontFamily: 'IBM Plex Mono', fontSize: 12 }, valueFormatter: (x: number) => fmt(x) },
    legend: { show: false },
    xAxis: { type: 'category', data: v.annual.map((a) => String(a.year)), axisTick: { show: false }, axisLine: { lineStyle: { color: '#232832' } },
      axisLabel: { color: '#9AA0AA', fontFamily: 'IBM Plex Mono', fontSize: 10 } },
    yAxis: { type: 'value', min: 0, splitLine: { lineStyle: { color: '#1B1F27' } },
      axisLabel: { color: '#9AA0AA', fontFamily: 'IBM Plex Mono', fontSize: 10, formatter: (x: number) => `${x / 1000}k` } },
    series: [
      { name: t('VIIRS observed'), type: 'bar', data: v.annual.map((a) => a.obs), itemStyle: { color: '#FF8A3D', borderRadius: [3, 3, 0, 0] }, barGap: '10%' },
      { name: t('Predicted from MODIS'), type: 'bar', data: v.annual.map((a) => a.pred), itemStyle: { color: '#6E9BF2', borderRadius: [3, 3, 0, 0] } },
    ],
  }
  return <ReactECharts option={option} style={{ height: 190, width: '100%' }} />
}
