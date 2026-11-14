// Vercel serverless function: fetches the latest near-real-time VIIRS fire detections
// over Argentina from NASA FIRMS and returns fire-active H3 cell-days, so the app can
// compare "right now" with 25 years of harmonized history.
// The FIRMS MAP_KEY stays on the server (env var FIRMS_MAP_KEY) and is never sent to browsers.
import { latLngToCell } from 'h3-js'
import staticCells from './static_cells.json'

// hexagons with persistent gas flares / industrial heat in the archive (type 1-3 on 20+ days)
const STATIC = new Set<string>(staticCells as string[])

const BBOX = '-74,-56,-53,-21' // west,south,east,north around Argentina
const DAYS = 5 // FIRMS area API allows 1-5 days
const SOURCE = 'VIIRS_NOAA20_NRT' // NOAA-20 calibrates ~1:1 to S-NPP (slope 0.99 in our fit)

export async function GET() {
  const key = process.env.FIRMS_MAP_KEY
  if (!key) {
    return Response.json({ ok: false, error: 'FIRMS_MAP_KEY is not set on the server' }, { status: 503 })
  }
  try {
    const url = `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${key}/${SOURCE}/${BBOX}/${DAYS}`
    const r = await fetch(url)
    const text = await r.text()
    if (!r.ok || !text.startsWith('latitude')) {
      return Response.json({ ok: false, error: `FIRMS responded: ${text.slice(0, 120)}` }, { status: 502 })
    }
    const [head, ...lines] = text.trim().split('\n')
    const cols = head.split(',')
    const iLat = cols.indexOf('latitude'), iLon = cols.indexOf('longitude'), iDate = cols.indexOf('acq_date')
    const iConf = cols.indexOf('confidence'), iType = cols.indexOf('type')
    const seen = new Set<string>()
    let detections = 0
    let removedStatic = 0
    let first = '9999', last = '0000'
    for (const line of lines) {
      const c = line.split(',')
      if (iType >= 0 && c[iType] && c[iType] !== '0') continue
      if (iConf >= 0 && c[iConf] === 'l') continue
      detections++
      const d = c[iDate]
      if (d < first) first = d
      if (d > last) last = d
      const cell = latLngToCell(+c[iLat], +c[iLon], 5)
      if (STATIC.has(cell)) { removedStatic++; continue }
      seen.add(`${cell}|${d}`)
    }
    const cellDays: [string, string][] = Array.from(seen, (s) => s.split('|') as [string, string])
    return Response.json(
      { ok: true, source: SOURCE, days: DAYS, from: first, to: last, detections, removedStatic, cellDays, fetched: new Date().toISOString() },
      { headers: { 'Cache-Control': 's-maxage=1800, stale-while-revalidate=3600' } },
    )
  } catch (e) {
    return Response.json({ ok: false, error: String(e) }, { status: 500 })
  }
}
