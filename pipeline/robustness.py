"""
BRASA robustness test: compare harmonization variants with leave-one-year-out
validation, nationally and region by region, and test whether the MODIS->VIIRS
relationship drifts over time.

Usage:
    python pipeline/robustness.py <firms-folder> <landcover-folder> [out.json]

Variants (all predict VIIRS S-NPP fire-active H3 cell-days from MODIS):
  A  national   : one model for Argentina, MODIS Terra+Aqua predictor          (original)
  B  aqua       : one model, Aqua-only predictor (same overpass time as VIIRS)
  C  daynight   : one model with separate day and night MODIS predictors
  D  landcover  : separate model per land-cover stratum (cropland / forest / grassland-shrub-wetland)
  E  lc+daynight: D with day and night predictors
Each model: log(V) = a[calendar month] + b*log(M) (+ b2*log(M_night) for day/night),
Duan smearing for the back-transform. Predictions for an area are the area's MODIS
cell-days scaled by its stratum's predicted VIIRS/MODIS ratio for that month.
"""
import json
import sys
import time

import numpy as np
import pandas as pd

sys.path.insert(0, __file__.rsplit("/", 1)[0])
from build_data import MONTHS, MIDX, VIIRS_START, load, landcover_classes  # noqa: E402
import h3  # noqa: E402

REGIONS = {
    "Argentina": None,
    "Paraná Delta": (-60.9, -34.3, -58.3, -32.0),
    "Córdoba Sierras": (-65.3, -33.6, -63.9, -30.3),
    "Gran Chaco": (-64.6, -28.0, -58.3, -22.0),
    "Andean Patagonia": (-72.5, -46.5, -70.4, -39.0),
}
STRATA = {0: "cropland", 1: "forest", 2: "grass/shrub/wetland", 3: "grass/shrub/wetland"}


def main():
    firms, lcdir = sys.argv[1], sys.argv[2]
    out = sys.argv[3] if len(sys.argv) > 3 else "robustness.json"
    t0 = time.time()
    df = load(firms)
    df["d"] = pd.to_datetime(df["d"])
    df["mi"] = [MIDX.get((y, m), -1) for y, m in zip(df.d.dt.year.values, df.d.dt.month.values)]
    df = df[df.mi >= 0].copy()
    coords = df[["lat", "lon"]].drop_duplicates()
    coords["cell"] = [h3.latlng_to_cell(a, b, 5) for a, b in zip(coords.lat.values, coords.lon.values)]
    df = df.merge(coords, on=["lat", "lon"], how="left")
    df["lc"] = landcover_classes(df, lcdir)
    # static stratum per cell: dominant land cover of everything that burned there
    dom = df.groupby(["cell", "lc"]).size().unstack(fill_value=0).idxmax(axis=1)
    df["stratum"] = df.cell.map(dom).map(STRATA)
    print(f"prepared {len(df):,} detections in {time.time()-t0:.0f}s")

    def cd(mask, name):
        x = df.loc[mask, ["cell", "d", "mi"]].drop_duplicates(["cell", "d"])
        return x.groupby(["cell", "mi"]).size().rename(name)

    M = df.grp == "M"
    cm = pd.concat([
        cd(M, "m"), cd(M & (df.sat == "Aqua"), "aqua"),
        cd(M & (df.dn == "D"), "mday"), cd(M & (df.dn == "N"), "mnight"),
        cd(df.grp == "S", "s"),
    ], axis=1).fillna(0).reset_index()
    cm["stratum"] = cm.cell.map(dom).map(STRATA)
    centers = {c: h3.cell_to_latlng(c) for c in cm.cell.unique()}
    cm["lat"] = cm.cell.map(lambda c: centers[c][0])
    cm["lon"] = cm.cell.map(lambda c: centers[c][1])
    cm["y"] = [MONTHS[i][0] for i in cm.mi]
    cm["mo"] = [MONTHS[i][1] for i in cm.mi]
    ov = cm[[MONTHS[i] >= VIIRS_START for i in cm.mi]].copy()
    years = sorted(ov.y.unique())

    def fit(rows, preds):
        r = rows[(rows.s > 0) & np.all([rows[p] > 0 for p in preds], axis=0)]
        X = np.zeros((len(r), 12 + len(preds)))
        X[np.arange(len(r)), r.mo.values - 1] = 1
        for k, p in enumerate(preds):
            X[:, 12 + k] = np.log(r[p].values)
        yv = np.log(r.s.values)
        coef, *_ = np.linalg.lstsq(X, yv, rcond=None)
        resid = yv - X @ coef
        return coef, float(np.mean(np.exp(resid)))

    def predict(coef, smear, row, preds):
        if any(row[p] <= 0 for p in preds):
            return None
        x = coef[int(row.mo) - 1] + sum(coef[12 + k] * np.log(row[p]) for k, p in enumerate(preds))
        return float(np.exp(x) * smear)

    VARIANTS = {
        "A_national": (False, ["m"]),
        "B_aqua": (False, ["aqua"]),
        "C_daynight": (False, ["mday", "mnight"]),
        "D_landcover": (True, ["m"]),
        "E_landcover_daynight": (True, ["mday", "mnight"]),
    }

    def stratum_totals(rows, by_stratum):
        keys = ["stratum", "mi", "y", "mo"] if by_stratum else ["mi", "y", "mo"]
        return rows.groupby(keys)[["m", "aqua", "mday", "mnight", "s"]].sum().reset_index()

    def ratio_table(train, test_years, by_stratum, preds):
        """VIIRS-equivalent / MODIS ratio per (stratum, month index) for the held-out months."""
        tr = stratum_totals(train, by_stratum)
        te = stratum_totals(ov[ov.y.isin(test_years)], by_stratum)
        ratios = {}
        groups = tr.groupby("stratum") if by_stratum else [("all", tr)]
        for g, rows in groups:
            coef, smear = fit(rows, preds)
            sub = te[te.stratum == g] if by_stratum else te
            for _, row in sub.iterrows():
                p = predict(coef, smear, row, preds)
                if p is None:  # a predictor is zero (e.g. no night fires): use the stratum's median VIIRS/MODIS ratio
                    ok = (rows.m > 0) & (rows.s > 0)
                    p = row.m * float(np.exp(np.median(np.log((rows.s[ok] / rows.m[ok]).values))))
                ratios[(g, int(row.mi))] = p / row.m if row.m > 0 else 0.0
        return ratios

    ov["parent"] = [h3.cell_to_parent(c, 3) for c in ov.cell]
    ALPHA = 150.0  # shrinkage strength in cell-days: small areas stay close to the stratum model

    def local_factors(train, by_stratum, preds):
        """Each H3 res-3 area's observed/predicted VIIRS ratio on training years, shrunk toward 1."""
        tr_years = sorted(train.y.unique())
        ratios = ratio_table(train, tr_years, by_stratum, preds)
        g = train.stratum if by_stratum else pd.Series("all", index=train.index)
        pred = train.m.values * np.array([ratios.get((gg, int(mi)), 0.0) for gg, mi in zip(g, train.mi)])
        agg = train.assign(pred=pred).groupby("parent")[["s", "pred"]].sum()
        return ((agg.s + ALPHA) / (agg.pred + ALPHA)).to_dict()

    VARIANTS["F_landcover_local"] = (True, ["m"])
    VARIANTS["G_national_local"] = (False, ["m"])

    results = {}
    for name, (by_stratum, preds) in VARIANTS.items():
        recs = []
        for yv in years:
            ratios = ratio_table(ov[ov.y != yv], [yv], by_stratum, preds)
            test = ov[ov.y == yv]
            g = test.stratum if by_stratum else pd.Series("all", index=test.index)
            r = np.array([ratios.get((gg, int(mi)), 0.0) for gg, mi in zip(g, test.mi)])
            if name.endswith("_local"):
                lf = local_factors(ov[ov.y != yv], by_stratum, preds)
                r = r * np.array([lf.get(pp, 1.0) for pp in test.parent])
            recs.append(test.assign(pred=test.m.values * r))
        pr = pd.concat(recs)
        per_region = {}
        for rname, box in REGIONS.items():
            sub = pr if box is None else pr[(pr.lon >= box[0]) & (pr.lat >= box[1]) & (pr.lon <= box[2]) & (pr.lat <= box[3])]
            ann = sub.groupby("y")[["s", "pred"]].sum()
            mon = sub.groupby("mi")[["s", "pred"]].sum()
            busy = mon[mon.s >= mon.s.median()]
            per_region[rname] = {
                "annual_mape": float(np.mean(np.abs(ann.pred - ann.s) / ann.s)),
                "annual_r": float(np.corrcoef(ann.s, ann.pred)[0, 1]),
                "monthly_median_ape_busy": float(np.median(np.abs(busy.pred - busy.s) / busy.s)),
                "monthly_r": float(np.corrcoef(mon.s, mon.pred)[0, 1]),
            }
        results[name] = per_region
        print(name, {k: f"{v['annual_mape']:.1%}/{v['monthly_median_ape_busy']:.1%}" for k, v in per_region.items()})

    # drift / extrapolation tests on the original national model
    nat = stratum_totals(ov, False)
    early_late = {}
    for label, tr_years, te_years in [("train 2019-2025 -> predict 2012-2014", range(2019, 2026), range(2012, 2015)),
                                      ("train 2012-2018 -> predict 2023-2025", range(2012, 2019), range(2023, 2026))]:
        coef, smear = fit(nat[nat.y.isin(tr_years)], ["m"])
        te = nat[nat.y.isin(te_years)]
        pred = np.array([predict(coef, smear, row, ["m"]) or 0 for _, row in te.iterrows()])
        a = te.assign(pred=pred).groupby("y")[["s", "pred"]].sum()
        early_late[label] = {"annual_mape": float(np.mean(np.abs(a.pred - a.s) / a.s)), "slope_b": float(coef[12])}
    slopes = {}
    # slope per 3-year window to look for drift
    for start in range(2012, 2024, 3):
        coef, _ = fit(nat[nat.y.between(start, start + 2)], ["m"])
        slopes[f"{start}-{start+2}"] = float(coef[12])
    print("drift:", early_late, slopes)

    json.dump({"variants": results, "extrapolation": early_late, "slope_by_period": slopes}, open(out, "w"), indent=1)
    print(f"wrote {out} in {time.time()-t0:.0f}s")


if __name__ == "__main__":
    main()
