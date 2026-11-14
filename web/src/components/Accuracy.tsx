import type { Robustness } from '../data'
import { useStore } from '../store'

const VARIANT_ES: Record<string, string> = {
  A_national: 'Una fórmula nacional',
  B_aqua: 'Solo Aqua (misma hora de paso que VIIRS)',
  C_daynight: 'Día y noche calibrados por separado',
  D_landcover: 'Una fórmula por tipo de suelo',
  E_landcover_daynight: 'Por tipo de suelo + día/noche',
  F_landcover_local: 'Por tipo de suelo + corrección local',
  G_national_local: 'Fórmula nacional + corrección local (usada)',
}
const VARIANT_NAMES: Record<string, string> = {
  A_national: 'One national formula',
  B_aqua: 'Aqua only (same overpass time as VIIRS)',
  C_daynight: 'Day and night calibrated separately',
  D_landcover: 'Separate formula per land type',
  E_landcover_daynight: 'Per land type + day/night',
  F_landcover_local: 'Per land type + local correction',
  G_national_local: 'National formula + local correction (used)',
}
const pct = (v: number) => `${(v * 100).toFixed(1)}%`
const tone = (v: number) => (v <= 0.06 ? 'text-[#7EE2A8]' : v <= 0.15 ? 'text-glow' : 'text-fire-soft')

export default function Accuracy({ r }: { r: Robustness }) {
  const es = useStore((s) => s.lang) === 'es'
  const T = (en: string, sp: string) => (es ? sp : en)
  const used = r.variants.G_national_local
  const regions = Object.keys(used)
  const avgRegional = (name: string) => {
    const v = r.variants[name]
    const ks = Object.keys(v).filter((k) => k !== 'Argentina')
    return ks.reduce((a, k) => a + v[k].annual_mape, 0) / ks.length
  }
  const extra = Object.entries(r.extrapolation)
  const slopes = Object.values(r.slope_by_period)

  return (
    <div className="panel flex flex-col gap-4 p-4 text-[13px]">
      <div>
        <h2 className="font-display text-base font-semibold">{T('How accurate is it, area by area?', '¿Qué tan preciso es, zona por zona?')}</h2>
        <p className="mt-1 text-muted">{T('Same hidden-year test, repeated for each region. Average yearly error between BRASA’s estimate and what VIIRS really saw.', 'La misma prueba de año oculto, repetida en cada región. Error anual promedio entre la estimación de BRASA y lo que VIIRS realmente vio.')}</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[420px] border-collapse text-left">
          <thead>
            <tr className="label">
              <th className="py-1.5 font-normal">{T('Area', 'Zona')}</th>
              <th className="py-1.5 text-right font-normal">{T('Yearly error', 'Error anual')}</th>
              <th className="py-1.5 text-right font-normal">{T('Busy-month error', 'Error en meses activos')}</th>
              <th className="py-1.5 text-right font-normal">{T('Match (r)', 'Coincidencia (r)')}</th>
            </tr>
          </thead>
          <tbody>
            {regions.map((k) => (
              <tr key={k} className="border-t border-line">
                <td className="py-1.5 text-soft">{es ? ({ Argentina: 'Argentina', Delta: 'Delta del Paraná', 'Paraná Delta': 'Delta del Paraná', 'Córdoba Sierras': 'Sierras de Córdoba', 'Andean Patagonia': 'Patagonia andina' } as Record<string, string>)[k] ?? k : k}</td>
                <td className={`py-1.5 text-right font-mono ${tone(used[k].annual_mape)}`}>{pct(used[k].annual_mape)}</td>
                <td className={`py-1.5 text-right font-mono ${tone(used[k].monthly_median_ape_busy)}`}>{pct(used[k].monthly_median_ape_busy)}</td>
                <td className="py-1.5 text-right font-mono text-soft">{used[k].monthly_r.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted">{T('Smaller areas are less certain: the Paraná Delta’s wetland fires swing a lot from year to year, so treat its pre-2012 values as ±25%.', 'Las zonas chicas son menos seguras: los fuegos de humedal del Delta del Paraná varían mucho de un año a otro, así que tomá sus valores antes de 2012 como ±25%.')}</p>

      <div>
        <h3 className="font-display text-sm font-semibold">{T('We tried other methods too', 'También probamos otros métodos')}</h3>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[420px] border-collapse text-left">
            <thead>
              <tr className="label">
                <th className="py-1.5 font-normal">{T('Method', 'Método')}</th>
                <th className="py-1.5 text-right font-normal">Argentina</th>
                <th className="py-1.5 text-right font-normal">{T('Avg of 4 regions', 'Promedio de 4 regiones')}</th>
              </tr>
            </thead>
            <tbody>
              {Object.keys(r.variants).map((k) => (
                <tr key={k} className={`border-t border-line ${k === 'G_national_local' ? 'bg-[#1A1710]' : ''}`}>
                  <td className={`py-1.5 ${k === 'G_national_local' ? 'font-semibold text-glow' : 'text-soft'}`}>{(es ? VARIANT_ES[k] : VARIANT_NAMES[k]) || k}</td>
                  <td className="py-1.5 text-right font-mono text-soft">{pct(r.variants[k].Argentina.annual_mape)}</td>
                  <td className="py-1.5 text-right font-mono text-soft">{pct(avgRegional(k))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-muted">{T('Using only Aqua or splitting day and night barely changes the result, so the method does not depend on those choices.', 'Usar solo Aqua o separar día y noche casi no cambia el resultado, así que el método no depende de esas decisiones.')}</p>
      </div>

      <div>
        <h3 className="font-display text-sm font-semibold">{T('Does the correction drift over time?', '¿La corrección cambia con el tiempo?')}</h3>
        <ul className="mt-2 flex flex-col gap-1 text-soft">
          {extra.map(([k, v]) => (
            <li key={k}><span className="text-muted">{k.replace('->', '→')}:</span> <b className={tone(v.annual_mape)}>{pct(v.annual_mape)}</b> {T('yearly error', 'error anual')}</li>
          ))}
          <li><span className="text-muted">{T('Slope b in 3-year windows:', 'Pendiente b en ventanas de 3 años:')}</span> <b className="text-text">{slopes.map((b) => b.toFixed(2)).join(' · ')}</b>{T(', with no trend', ', sin tendencia')}</li>
        </ul>
        <p className="mt-2 text-xs text-muted">{T('A formula learned only on recent years still predicts the earliest VIIRS years well. That supports using it to extend the record back to 2000.', 'Una fórmula aprendida solo con años recientes igual predice bien los primeros años de VIIRS. Eso respalda usarla para extender el registro hasta 2000.')}</p>
      </div>
    </div>
  )
}
