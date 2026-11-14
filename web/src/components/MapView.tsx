import { useMemo, useState } from 'react'
import DeckGL from '@deck.gl/react'
import { TileLayer, H3HexagonLayer } from '@deck.gl/geo-layers'
import { BitmapLayer, PolygonLayer } from '@deck.gl/layers'
import type { PickingInfo } from '@deck.gl/core'
import type { BBox, Dataset, Mode } from '../data'
import { fmt } from '../data'
import { ramp } from '../colors'
import { useStore } from '../store'

// NASA GIBS: VIIRS Black Marble night lights as the basemap
const GIBS = 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_Black_Marble/default/2016-01-01/GoogleMapsCompatible_Level8/{z}/{y}/{x}.png'

const INITIAL_VIEW = { longitude: -64.5, latitude: -38.5, zoom: 3.4, pitch: 0, bearing: 0 }

interface Props {
  ds: Dataset
  bbox: BBox | null
}

type Hex = { hex: string; v: number; inRegion: boolean }

function rasterLayer(id: string, url: string, maxZoom: number, opacity = 1) {
  return new TileLayer({
    id,
    data: url,
    minZoom: 0,
    maxZoom,
    tileSize: 256,
    opacity,
    onTileError: () => {},
    renderSubLayers: (props) => {
      const { boundingBox } = props.tile
      return new BitmapLayer(props, {
        data: undefined,
        image: props.data,
        bounds: [boundingBox[0][0], boundingBox[0][1], boundingBox[1][0], boundingBox[1][1]],
      })
    },
  })
}

function boxPolygon(b: BBox) {
  return [[b.west, b.south], [b.east, b.south], [b.east, b.north], [b.west, b.north], [b.west, b.south]]
}

export default function MapView({ ds, bbox }: Props) {
  const { mode, monthIdx, drawing, draftCorner, setDraftCorner, setCustomBox, extruded } = useStore()
  const [hover, setHover] = useState<{ x: number; y: number; v: number } | null>(null)

  const hexes: Hex[] = useMemo(() => {
    const rows = ds.cells.months[monthIdx] || []
    return rows.map((r) => {
      const [lat, lon] = ds.cells.centers[r[0]]
      const v = mode === 'modis' ? r[1] : mode === 'naive' ? r[2] : r[3] / 10
      const inRegion = !bbox || (lon >= bbox.west && lon <= bbox.east && lat >= bbox.south && lat <= bbox.north)
      return { hex: ds.cells.cells[r[0]], v, inRegion }
    }).filter((h) => h.v > 0)
  }, [ds, monthIdx, mode, bbox])

  const layers = [
    rasterLayer('basemap', GIBS, 8),
    new H3HexagonLayer<Hex>({
      id: 'fire',
      data: hexes,
      getHexagon: (d) => d.hex,
      getFillColor: (d) => {
        const t = Math.log1p(d.v) / Math.log1p(31)
        const [r, g, b] = ramp(0.15 + 0.85 * t)
        return [r, g, b, d.inRegion ? 235 : 90]
      },
      extruded,
      getElevation: (d) => Math.log1p(d.v) * 14000,
      elevationScale: 1,
      stroked: false,
      pickable: true,
      updateTriggers: { getFillColor: [bbox, mode], getElevation: [mode] },
      transitions: { getFillColor: 250, getElevation: 250 },
      onHover: (info: PickingInfo<Hex>) => setHover(info.object ? { x: info.x, y: info.y, v: info.object.v } : null),
    }),
    bbox && new PolygonLayer({
      id: 'region',
      data: [{ polygon: boxPolygon(bbox) }],
      getPolygon: (d: { polygon: number[][] }) => d.polygon,
      stroked: true,
      filled: false,
      getLineColor: [255, 224, 138, 230],
      lineWidthMinPixels: 1.5,
    }),
  ].filter(Boolean)

  const onClick = (info: PickingInfo) => {
    if (!drawing || !info.coordinate) return
    const [lon, lat] = info.coordinate
    if (!draftCorner) { setDraftCorner([lon, lat]); return }
    const [lon0, lat0] = draftCorner
    setCustomBox({ west: Math.min(lon, lon0), east: Math.max(lon, lon0), south: Math.min(lat, lat0), north: Math.max(lat, lat0) })
  }

  return (
    <div className="relative h-full w-full overflow-hidden rounded-xl" style={{ cursor: drawing ? 'crosshair' : undefined }}>
      <DeckGL
        initialViewState={{ ...INITIAL_VIEW, pitch: extruded ? 45 : 0 }}
        controller={{ dragRotate: true }}
        layers={layers}
        onClick={onClick}
        getCursor={({ isDragging }) => (drawing ? 'crosshair' : isDragging ? 'grabbing' : 'grab')}
      />
      {hover && (
        <div className="pointer-events-none absolute rounded-md border border-line bg-ink/90 px-2 py-1 font-mono text-xs text-text"
          style={{ left: hover.x + 12, top: hover.y + 12 }}>
          {fmt(hover.v)} fire-active days
        </div>
      )}
      {drawing && (
        <div className="absolute left-3 top-3 rounded-lg border border-glow/50 bg-ink/90 px-3 py-2 text-sm text-glow">
          {draftCorner ? 'Now click the opposite corner' : 'Click one corner of your area'}
        </div>
      )}
      <div className="pointer-events-none absolute bottom-2 right-3 text-[10px] text-muted">
        Basemap: NASA GIBS VIIRS Black Marble
      </div>
    </div>
  )
}

export type { Mode }
