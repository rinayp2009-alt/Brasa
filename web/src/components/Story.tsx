import { useEffect } from 'react'
import type { Mode } from '../data'
import { useStore } from '../store'
import { useT } from '../i18n'

interface Step {
  title: string
  text: string
  es: [string, string]
  region: string
  mode: Mode
  month: string
  colorBy: 'fire' | 'land'
  live?: boolean
}

const STEPS: Step[] = [
  {
    title: '1 · The problem',
    text: 'NASA has watched fires from space since 2000, but with two different sensors. Throw MODIS and VIIRS together and fire activity seems to double in 2012, then jump again in 2018. Those jumps are new satellites, not new fires.',
    es: ['1 · El problema', 'La NASA observa fuegos desde el espacio desde 2000, pero con dos sensores distintos. Si se juntan MODIS y VIIRS, la actividad de fuego parece duplicarse en 2012 y saltar otra vez en 2018. Esos saltos son satélites nuevos, no fuegos nuevos.'],
    region: 'argentina', mode: 'naive', month: '2013-09', colorBy: 'fire',
  },
  {
    title: '2 · The fix',
    text: 'BRASA counts burning hexagon-days and calibrates MODIS to VIIRS on the 14 years both flew. The fake jumps disappear, and every year from 2000 to 2025 can finally be compared fairly. Tested year by year: 3.5% average error for the whole country.',
    es: ['2 · La solución', 'BRASA cuenta hexágonos-día con fuego y calibra MODIS con VIIRS en los 14 años en que volaron juntos. Los saltos falsos desaparecen y cada año de 2000 a 2025 por fin se puede comparar. Probado año por año: 3,5% de error promedio para todo el país.'],
    region: 'argentina', mode: 'harm', month: '2013-09', colorBy: 'fire',
  },
  {
    title: '3 · Paraná Delta, August 2020',
    text: 'The wetlands next to Rosario burned for months. August 2020 had about five times the burning of a normal August, one of the four worst Augusts on record, in a near-tie with 2004, 2006 and 2008. That kind of comparison is only possible because the old and new satellites are blended fairly.',
    es: ['3 · Delta del Paraná, agosto 2020', 'Los humedales frente a Rosario ardieron durante meses. Agosto de 2020 tuvo unas cinco veces la quema de un agosto normal, uno de los cuatro peores agostos registrados, casi empatado con 2004, 2006 y 2008. Esa comparación solo es posible porque los satélites viejos y nuevos se combinan de forma justa.'],
    region: 'delta', mode: 'harm', month: '2020-08', colorBy: 'fire',
  },
  {
    title: '4 · An earlier warning: April 2008',
    text: 'In April 2008, smoke from Delta fires blanketed Buenos Aires. Because BRASA harmonizes the old MODIS-only years, this pre-VIIRS crisis shows up on the same scale as 2020. Without harmonization it would look small.',
    es: ['4 · Un aviso anterior: abril 2008', 'En abril de 2008, el humo de los incendios del Delta cubrió Buenos Aires. Como BRASA armoniza los años solo-MODIS, esta crisis anterior a VIIRS aparece en la misma escala que 2020. Sin armonizar se vería chica.'],
    region: 'delta', mode: 'harm', month: '2008-04', colorBy: 'fire',
  },
  {
    title: '5 · What is burning?',
    text: 'Each fire is matched to NASA’s land cover map. In the Gran Chaco, forest and woodland fires (green) make up a much bigger share than elsewhere, a sign of forest clearing, not just grassland burns.',
    es: ['5 · ¿Qué se quema?', 'Cada fuego se cruza con el mapa de cobertura del suelo de la NASA. En el Gran Chaco, los fuegos de bosque y monte (verde) son una proporción mucho mayor que en otras zonas: una señal de desmonte, no solo quema de pastizales.'],
    region: 'chaco', mode: 'harm', month: '2019-10', colorBy: 'land',
  },
  {
    title: '6 · Right now',
    text: 'The top bar compares the last 5 days of live NASA detections with 25 years of history for the same month, and the record chart shows whether this year is running hotter than past years, so responders know at a glance whether this is normal or dangerous. Now explore: pick any area, or draw your own.',
    es: ['6 · Ahora mismo', 'La barra de arriba compara los últimos 5 días de detecciones en vivo de la NASA con 25 años de historia del mismo mes, y el gráfico de récord muestra si este año viene peor que los anteriores. Así los brigadistas saben de un vistazo si esta semana es normal o peligrosa. Ahora explorá: elegí cualquier zona o dibujá la tuya.'],
    region: 'argentina', mode: 'harm', month: '2020-09', colorBy: 'fire', live: true,
  },
]

export default function Story({ months }: { months: string[] }) {
  const { storyStep, setStoryStep, setRegion, setMode, setMonth, setColorBy, setPlaying, setShowLive, lang } = useStore()
  const t = useT()

  useEffect(() => {
    if (storyStep === null) return
    const st = STEPS[storyStep]
    setPlaying(false)
    setRegion(st.region)
    setMode(st.mode)
    setMonth(months.indexOf(st.month))
    setColorBy(st.colorBy)
    setShowLive(!!st.live)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [storyStep]) // eslint-disable-line react-hooks/exhaustive-deps

  if (storyStep === null) return null
  const st = STEPS[storyStep]
  const last = storyStep === STEPS.length - 1

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 mx-auto max-w-[560px] rounded-2xl border border-fire/60 bg-ink/95 p-5 shadow-[0_0_40px_rgba(255,138,61,0.25)] backdrop-blur sm:left-auto sm:right-6"
      role="dialog" aria-label="Guided tour">
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="label text-fire-soft">{t('Guided tour')} · {storyStep + 1} {lang === 'es' ? 'de' : 'of'} {STEPS.length}</span>
        <button onClick={() => setStoryStep(null)} aria-label="Close tour" className="rounded-md px-2 text-lg text-muted hover:text-text">×</button>
      </div>
      <h3 className="font-display text-xl font-semibold">{lang === 'es' ? st.es[0] : st.title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-soft">{lang === 'es' ? st.es[1] : st.text}</p>
      <div className="mt-4 flex items-center justify-between gap-3">
        <div className="flex gap-1.5">
          {STEPS.map((_, i) => (
            <button key={i} onClick={() => setStoryStep(i)} aria-label={`Go to step ${i + 1}`}
              className={`h-2 rounded-full transition-all ${i === storyStep ? 'w-6 bg-fire' : 'w-2 bg-line hover:bg-muted'}`} />
          ))}
        </div>
        <div className="flex gap-2">
          {storyStep > 0 && (
            <button onClick={() => setStoryStep(storyStep - 1)} className="min-h-10 rounded-lg border border-line px-4 text-sm text-soft hover:border-muted">{t('Back')}</button>
          )}
          <button onClick={() => setStoryStep(last ? null : storyStep + 1)}
            className="min-h-10 rounded-lg bg-fire px-4 text-sm font-semibold text-[#120A04]">
            {last ? t('Explore on my own') : t('Next')}
          </button>
        </div>
      </div>
    </div>
  )
}
