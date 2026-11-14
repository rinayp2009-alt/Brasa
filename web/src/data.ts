// Loads the harmonized dataset produced by pipeline/build_data.py and derives
// everything the UI needs for a region: monthly series, anomalies, fire season.

export type Mode = 'modis' | 'naive' | 'harm'

export interface Meta {
  months: string[]
  viirs_start: string
  aqua_start: string
  factor: (number | null)[]
  source: string[]
  national: Record<'modis' | 'terra' | 'snpp' | 'noaa20' | 'naive' | 'harmonized' | 'lo' | 'hi', number[]>
  models: Record<string, { a: number[]; b: number; sigma: number; smear: number; n: number }>
  h3_resolution: number
  unit: string
  sources: string[]
}

export interface Validation {
  r_monthly: number
  r_log_monthly: number
  r_annual: number
  mape_annual: number
  median_ape_monthly_busy: number
  annual: { year: number; obs: number; pred: number }[]
  monthly: { m: string; obs: number; pred: number }[]
}

export interface Cells {
  cells: string[]
  centers: [number, number][] // [lat, lon]
  months: number[][][] // per month: rows of [cellIdx, modis, naive, harm*10, crop%, forest%, grass%]
}

type Scores = { annual_mape: number; annual_r: number; monthly_median_ape_busy: number; monthly_r: number }
export interface Robustness {
  variants: Record<string, Record<string, Scores>>
  extrapolation: Record<string, { annual_mape: number; slope_b: number }>
  slope_by_period: Record<string, number>
}

export interface Dataset {
  meta: Meta
  validation: Validation
  cells: Cells
  robustness: Robustness | null
}

export async function loadData(): Promise<Dataset> {
  const [meta, validation, cells, robustness] = await Promise.all([
    fetch('/data/meta.json').then((r) => r.json()),
    fetch('/data/validation.json').then((r) => r.json()),
    fetch('/data/cells.json').then((r) => r.json()),
    fetch('/data/robustness.json').then((r) => r.json()).catch(() => null),
  ])
  return { meta, validation, cells, robustness }
}

export interface BBox { west: number; south: number; east: number; north: number }

export interface Region {
  id: string
  name: string
  blurb: string
  bbox: BBox | null // null = all of Argentina
}

export const REGIONS: Region[] = [
  { id: 'argentina', name: 'All Argentina', blurb: 'Every hotspot in the country', bbox: null },
  { id: 'delta', name: 'Paraná Delta', blurb: 'Wetland islands burned for grazing; record fires in 2020', bbox: { west: -60.9, south: -34.3, east: -58.3, north: -32.0 } },
  { id: 'cordoba', name: 'Córdoba Sierras', blurb: 'Mountain grass and scrub fires each late winter', bbox: { west: -65.3, south: -33.6, east: -63.9, north: -30.3 } },
  { id: 'chaco', name: 'Gran Chaco', blurb: 'Dry forest clearing and the country’s busiest burning', bbox: { west: -64.6, south: -28.0, east: -58.3, north: -22.0 } },
  { id: 'patagonia', name: 'Andean Patagonia', blurb: 'Rare but severe summer forest fires', bbox: { west: -72.5, south: -46.5, east: -70.4, north: -39.0 } },
]

export const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export function inBox(lat: number, lon: number, b: BBox | null) {
  if (!b) return true
  return lon >= b.west && lon <= b.east && lat >= b.south && lat <= b.north
}

export interface RegionSeries {
  modis: number[]
  naive: number[]
  harm: number[]
  lo: number[]
  hi: number[]
  crop: number[]
  forest: number[]
  grass: number[]
  cellMask: Uint8Array
  nCells: number
}

export const LAND = [
  { key: 'crop', name: 'Cropland & farms', color: '#E8C547', note: 'Agricultural burning' },
  { key: 'forest', name: 'Forest & woodland', color: '#3FAE78', note: 'Wildfire in trees' },
  { key: 'grass', name: 'Grass, shrub & wetland', color: '#FF8A3D', note: 'Wildland and grazing fires' },
] as const

/** Sum every cell inside the box, month by month, for each record. */
export function regionSeries(ds: Dataset, bbox: BBox | null): RegionSeries {
  const { cells, meta } = ds
  const n = meta.months.length
  const mask = new Uint8Array(cells.cells.length)
  let nCells = 0
  cells.centers.forEach(([lat, lon], i) => {
    if (inBox(lat, lon, bbox)) { mask[i] = 1; nCells++ }
  })
  const modis = new Array(n).fill(0), naive = new Array(n).fill(0), harm = new Array(n).fill(0)
  const crop = new Array(n).fill(0), forest = new Array(n).fill(0), grass = new Array(n).fill(0)
  cells.months.forEach((rows, t) => {
    for (const r of rows) {
      if (!mask[r[0]]) continue
      const h = r[3] / 10
      modis[t] += r[1]; naive[t] += r[2]; harm[t] += h
      crop[t] += h * (r[4] || 0) / 100; forest[t] += h * (r[5] || 0) / 100; grass[t] += h * (r[6] || 0) / 100
    }
  })
  // uncertainty band: national ratio of band to value, applied to the region
  const lo = harm.map((v, t) => (meta.national.harmonized[t] ? v * meta.national.lo[t] / meta.national.harmonized[t] : v))
  const hi = harm.map((v, t) => (meta.national.harmonized[t] ? v * meta.national.hi[t] / meta.national.harmonized[t] : v))
  return { modis, naive, harm, lo, hi, crop, forest, grass, cellMask: mask, nCells }
}

export function pick(s: RegionSeries, mode: Mode) {
  return mode === 'modis' ? s.modis : mode === 'naive' ? s.naive : s.harm
}

export const ym = (key: string) => ({ y: +key.slice(0, 4), m: +key.slice(5, 7) })

/** z-score of log1p(value) against the same calendar month in full years 2001-2025. */
export function anomalies(months: string[], values: number[]) {
  const byMonth: number[][] = Array.from({ length: 12 }, () => [])
  months.forEach((k, i) => { const { y, m } = ym(k); if (y >= 2001) byMonth[m - 1].push(Math.log1p(values[i])) })
  const stats = byMonth.map((xs) => {
    const mean = xs.reduce((a, b) => a + b, 0) / xs.length
    const sd = Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length) || 1
    return { mean, sd }
  })
  const z = months.map((k, i) => { const s = stats[ym(k).m - 1]; return (Math.log1p(values[i]) - s.mean) / s.sd })
  const typical = stats.map((s) => Math.expm1(s.mean))
  return { z, typical }
}

/** Rank of a month among the same calendar month in all years (1 = most fire). */
export function rankOf(months: string[], values: number[], idx: number) {
  const m = ym(months[idx]).m
  const same = months.map((k, i) => ({ i, m: ym(k).m, v: values[i], y: ym(k).y })).filter((o) => o.m === m && o.y >= 2001)
  same.sort((a, b) => b.v - a.v)
  return { rank: same.findIndex((o) => o.i === idx) + 1, of: same.length }
}

/** Average harmonized activity per calendar month and the fire season around its peak. */
export function season(months: string[], values: number[], from = 2003, to = 2025) {
  const sum = new Array(12).fill(0), cnt = new Array(12).fill(0)
  months.forEach((k, i) => { const { y, m } = ym(k); if (y >= from && y <= to) { sum[m - 1] += values[i]; cnt[m - 1]++ } })
  const clim = sum.map((s, i) => (cnt[i] ? s / cnt[i] : 0))
  const peak = clim.indexOf(Math.max(...clim))
  const thr = clim[peak] * 0.4
  let start = peak, end = peak
  for (let k = 0; k < 5 && clim[(start + 11) % 12] >= thr; k++) start = (start + 11) % 12
  for (let k = 0; k < 5 && clim[(end + 1) % 12] >= thr; k++) end = (end + 1) % 12
  return { clim, peak, start, end }
}

export const fmt = (v: number) => Math.round(v).toLocaleString('en-US')
