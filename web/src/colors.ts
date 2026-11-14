// Fire ramp from near-black to glowing yellow; lightness rises steadily so it
// reads for color-blind viewers too.
const STOPS: [number, number, number][] = [
  [36, 22, 22],
  [96, 30, 22],
  [170, 58, 24],
  [235, 120, 40],
  [255, 190, 90],
  [255, 236, 170],
]

export function ramp(t: number): [number, number, number] {
  t = Math.max(0, Math.min(1, t))
  const p = t * (STOPS.length - 1)
  const i = Math.min(Math.floor(p), STOPS.length - 2)
  const f = p - i
  const a = STOPS[i], b = STOPS[i + 1]
  return [0, 1, 2].map((k) => Math.round(a[k] + (b[k] - a[k]) * f)) as [number, number, number]
}

export const rampCss = (t: number) => `rgb(${ramp(t).join(',')})`

export const ECHARTS_RAMP = STOPS.map((c) => `rgb(${c.join(',')})`)
