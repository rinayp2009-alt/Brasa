import type { Robustness } from '../data'

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
        <h2 className="font-display text-base font-semibold">How accurate is it, area by area?</h2>
        <p className="mt-1 text-muted">Same hidden-year test, repeated for each region. Average yearly error between BRASA’s estimate and what VIIRS really saw.</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[420px] border-collapse text-left">
          <thead>
            <tr className="label">
              <th className="py-1.5 font-normal">Area</th>
              <th className="py-1.5 text-right font-normal">Yearly error</th>
              <th className="py-1.5 text-right font-normal">Busy-month error</th>
              <th className="py-1.5 text-right font-normal">Match (r)</th>
            </tr>
          </thead>
          <tbody>
            {regions.map((k) => (
              <tr key={k} className="border-t border-line">
                <td className="py-1.5 text-soft">{k}</td>
                <td className={`py-1.5 text-right font-mono ${tone(used[k].annual_mape)}`}>{pct(used[k].annual_mape)}</td>
                <td className={`py-1.5 text-right font-mono ${tone(used[k].monthly_median_ape_busy)}`}>{pct(used[k].monthly_median_ape_busy)}</td>
                <td className="py-1.5 text-right font-mono text-soft">{used[k].monthly_r.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted">Smaller areas are less certain: the Paraná Delta’s wetland fires swing a lot from year to year, so treat its pre-2012 values as ±25%.</p>

      <div>
        <h3 className="font-display text-sm font-semibold">We tried other methods too</h3>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[420px] border-collapse text-left">
            <thead>
              <tr className="label">
                <th className="py-1.5 font-normal">Method</th>
                <th className="py-1.5 text-right font-normal">Argentina</th>
                <th className="py-1.5 text-right font-normal">Avg of 4 regions</th>
              </tr>
            </thead>
            <tbody>
              {Object.keys(r.variants).map((k) => (
                <tr key={k} className={`border-t border-line ${k === 'G_national_local' ? 'bg-[#1A1710]' : ''}`}>
                  <td className={`py-1.5 ${k === 'G_national_local' ? 'font-semibold text-glow' : 'text-soft'}`}>{VARIANT_NAMES[k] || k}</td>
                  <td className="py-1.5 text-right font-mono text-soft">{pct(r.variants[k].Argentina.annual_mape)}</td>
                  <td className="py-1.5 text-right font-mono text-soft">{pct(avgRegional(k))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-muted">Using only Aqua or splitting day and night barely changes the result, so the method does not depend on those choices.</p>
      </div>

      <div>
        <h3 className="font-display text-sm font-semibold">Does the correction drift over time?</h3>
        <ul className="mt-2 flex flex-col gap-1 text-soft">
          {extra.map(([k, v]) => (
            <li key={k}><span className="text-muted">{k.replace('->', '→')}:</span> <b className={tone(v.annual_mape)}>{pct(v.annual_mape)}</b> yearly error</li>
          ))}
          <li><span className="text-muted">Slope b in 3-year windows:</span> <b className="text-text">{slopes.map((b) => b.toFixed(2)).join(' · ')}</b>, with no trend</li>
        </ul>
        <p className="mt-2 text-xs text-muted">A formula learned only on recent years still predicts the earliest VIIRS years well. That supports using it to extend the record back to 2000.</p>
      </div>
    </div>
  )
}
