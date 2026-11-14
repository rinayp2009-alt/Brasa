import { create } from 'zustand'
import type { BBox, Mode } from './data'

interface State {
  mode: Mode
  regionId: string // preset id or 'custom'
  customBox: BBox | null
  monthIdx: number
  playing: boolean
  drawing: boolean
  draftCorner: [number, number] | null
  extruded: boolean
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

export const useStore = create<State>((set) => ({
  mode: (params.get('mode') as Mode) || 'harm',
  regionId: params.get('region') || 'delta',
  customBox: null,
  monthIdx: params.get('t') ? +params.get('t')! : -1,
  playing: false,
  drawing: false,
  draftCorner: null,
  extruded: false,
  setMode: (mode) => set({ mode }),
  setRegion: (regionId) => set({ regionId, drawing: false, draftCorner: null }),
  setCustomBox: (customBox) => set({ customBox, regionId: 'custom', drawing: false, draftCorner: null }),
  setMonth: (monthIdx) => set({ monthIdx }),
  setPlaying: (playing) => set({ playing }),
  setDrawing: (drawing) => set({ drawing, draftCorner: null }),
  setDraftCorner: (draftCorner) => set({ draftCorner }),
  setExtruded: (extruded) => set({ extruded }),
}))
