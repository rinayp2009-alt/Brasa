import { create } from 'zustand'
import type { BBox, Mode } from './data'
import { MONTH_NAMES } from './data'

export type Lang = 'en' | 'es'
const MONTHS: Record<Lang, string[]> = {
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  es: ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'],
}
function applyLang(l: Lang) {
  MONTH_NAMES.splice(0, 12, ...MONTHS[l])
  try { document.documentElement.lang = l } catch { /* ignore */ }
}

export interface LiveData {
  ok: boolean
  error?: string
  source?: string
  days?: number
  from?: string
  to?: string
  detections?: number
  cellDays?: [string, string][]
  fetched?: string
}

interface State {
  lang: Lang
  setLang: (l: Lang) => void
  mode: Mode
  regionId: string // preset id or 'custom'
  customBox: BBox | null
  monthIdx: number
  playing: boolean
  drawing: boolean
  draftCorner: [number, number] | null
  extruded: boolean
  colorBy: 'fire' | 'land'
  storyStep: number | null
  setStoryStep: (n: number | null) => void
  showLive: boolean
  live: LiveData | null
  setColorBy: (c: 'fire' | 'land') => void
  setShowLive: (v: boolean) => void
  setLive: (l: LiveData | null) => void
  setMode: (m: Mode) => void
  setRegion: (id: string) => void
  setCustomBox: (b: BBox) => void
  setMonth: (i: number) => void
  setPlaying: (p: boolean) => void
  setDrawing: (d: boolean) => void
  setDraftCorner: (c: [number, number] | null) => void
  setExtruded: (e: boolean) => void
}

// read initial view from the URL so any view can be shared as a link
const params = new URLSearchParams(window.location.search)
const box = params.get('box')?.split(',').map(Number)
const initBox: BBox | null = box && box.length === 4 && box.every((x) => Number.isFinite(x)) ? { west: box[0], south: box[1], east: box[2], north: box[3] } : null

let initLang: Lang = params.get('lang') === 'es' ? 'es' : 'en'
if (!params.get('lang')) { try { if (localStorage.getItem('brasa_lang') === 'es') initLang = 'es' } catch { /* storage blocked */ } }
applyLang(initLang)

export const useStore = create<State>((set) => ({
  lang: initLang,
  setLang: (lang) => { applyLang(lang); try { localStorage.setItem('brasa_lang', lang) } catch { /* ignore */ } set({ lang }) },
  mode: (params.get('mode') as Mode) || 'harm',
  regionId: initBox ? 'custom' : params.get('region') || 'delta',
  customBox: initBox,
  monthIdx: params.get('t') ? +params.get('t')! : -1,
  playing: false,
  drawing: false,
  draftCorner: null,
  extruded: false,
  colorBy: 'fire',
  storyStep: null,
  setStoryStep: (storyStep) => set({ storyStep }),
  showLive: false,
  live: null,
  setColorBy: (colorBy) => set({ colorBy }),
  setShowLive: (showLive) => set({ showLive }),
  setLive: (live) => set({ live }),
  setMode: (mode) => set({ mode }),
  setRegion: (regionId) => set({ regionId, drawing: false, draftCorner: null }),
  setCustomBox: (customBox) => set({ customBox, regionId: 'custom', drawing: false, draftCorner: null }),
  setMonth: (monthIdx) => set({ monthIdx }),
  setPlaying: (playing) => set({ playing }),
  setDrawing: (drawing) => set({ drawing, draftCorner: null }),
  setDraftCorner: (draftCorner) => set({ draftCorner }),
  setExtruded: (extruded) => set({ extruded }),
}))
