import ReactECharts from 'echarts-for-react'
import { LAND, MONTH_NAMES, fmt, ym } from '../data'
import type { RegionSeries } from '../data'
import InfoTip from './InfoTip'
import { useT } from '../i18n'

interface Props {
  months: string[]
  series: RegionSeries
  monthIdx: number
  regionName: string
}

export default function WhatsBurning({ months, series, monthIdx, regionName }: Props) {
  const t = useT()
  const cur = [series.crop[monthIdx], series.forest[monthIdx], series.grass[monthIdx]]
  const tot = cur.reduce((a, b) => a + b, 0)
  const { y, m } = ym(months[monthIdx])

  // yearly totals per land type
  const years: number[] = []
  const byYear: Record<string, number[]> = { crop: [], forest: [], grass: [] }
  months.forEach((k, i) => {
    const yr = ym(k).y
    if (yr < 2001) return
    let idx = years.indexOf(yr)
    if (idx < 0) { years.push(yr); idx = years.length - 1; byYear.crop.push(0); byYear.forest.push(0); byYear.grass.push(0) }
    byYear.crop[idx] += series.crop[i]; byYear.forest[idx] += series.forest[i]; byYear.grass[idx] += series.grass[i]
  })
  const yearTot = years.map((_, i) => byYear.crop[i] + byYear.forest[i] + byYear.grass[i] || 1)

  const option = {
    grid: { left: 36, right: 8, top: 10, bottom: 24 },
    tooltip: {
      trigger: 'axis', backgroundColor: '#0B0D10', borderColor: '#232832',
      textStyle: { color: '#E8E6E1', fontFamily: 'IBM Plex Mono', fontSize: 12 },
      valueFormatter: (v: number) => `${v.toFixed(0)}%`,
    },
    xAxis: { type: 'category', data: years.map(String), axisTick: { show: false }, axisLine: { lineStyle: { color: '#232832' } },
      axisLabel: { color: '#9AA0AA', fontFamily: 'IBM Plex Mono', fontSize: 10, interval: 5 } },
    yAxis: { type: 'value', max: 100, splitLine: { lineStyle: { color: '#1B1F27' } },
      axisLabel: { color: '#9AA0AA', fontFamily: 'IBM Plex Mono', fontSize: 10, formatter: '{value}%' } },
    series: LAND.map((l) => ({
      name: t(l.name), type: 'bar', stack: 'a', barCategoryGap: '15%',
      data: years.map((yr, i) => ({ value: (byYear[l.key][i] / yearTot[i]) * 100, itemStyle: { color: l.color, opacity: yr === y ? 1 : 0.7 } })),
    })),
  }

  return (
    <div className="panel flex flex-col gap-3 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="flex items-center font-display text-base font-semibold">{t('What’s burning')} · {regionName}<InfoTip text={t("Every fire is matched to NASA's MODIS land cover map for that year. Cropland usually means farmers burning fields; forest and grassland fires are wildland fires.")} /></h2>
        <span className="font-mono text-[11px] text-muted">{t('NASA MODIS land cover under each fire')}</span>
      </div>
      <div className="flex flex-col gap-2">
        <span className="label">{MONTH_NAMES[m - 1]} {y}</span>
        {tot > 0 ? (
          <>
            <div className="flex h-4 overflow-hidden rounded-md">
              {LAND.map((l, i) => (
                <div key={l.key} style={{ width: `${(cur[i] / tot) * 100}%`, background: l.color }} title={`${t(l.name)}: ${Math.round((cur[i] / tot) * 100)}%`} />
              ))}
            </div>
            <div className="grid grid-cols-1 gap-1 sm:grid-cols-3">
              {LAND.map((l, i) => (
                <div key={l.key} className="flex items-center gap-2 text-xs text-soft">
                  <span className="h-2.5 w-2.5 flex-none rounded-sm" style={{ background: l.color }} />
                  <span><b className="text-text">{Math.round((cur[i] / tot) * 100)}%</b> {t(l.name)} <span className="text-muted">({fmt(cur[i])})</span></span>
                </div>
              ))}
            </div>
          </>
        ) : <span className="text-sm text-muted">{t('No fires this month.')}</span>}
      </div>
      <span className="label">{t('Share by year')}</span>
      <ReactECharts option={option} notMerge style={{ height: 150, width: '100%' }} />
    </div>
  )
}
