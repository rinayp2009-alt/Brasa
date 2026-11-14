"""
BRASA data pipeline: harmonize NASA FIRMS MODIS and VIIRS active-fire hotspots
into one consistent burning-activity record for Argentina (Nov 2000 - Dec 2025).

Usage:
    python pipeline/build_data.py <path-to-firms-folder> [output-folder]

The FIRMS folder must contain the yearly country CSVs from
https://firms.modaps.eosdis.nasa.gov/country/ in three subfolders:
    modis/        MODIS Collection 6.1 (Terra + Aqua), 1 km
    viirs-snpp/   VIIRS 375 m on Suomi NPP
    viirs-jpss1/  VIIRS 375 m on NOAA-20

Method (see METHODS.md for the full write-up):
 1. Clean: keep vegetation fires (type 0); MODIS confidence >= 30,
    VIIRS confidence nominal or high.
 2. Grid: assign each detection to an H3 hexagon (resolution 5, ~252 km2).
    The unit of activity is a "fire-active cell-day": a hexagon with at least
    one detection on a given day. Counting cells instead of raw pixels removes
    most of the 1 km vs 375 m resolution difference.
 3. Calibrate: on the 2012-2025 overlap, fit
        log(VIIRS) = a[month] + b * log(MODIS)
    on monthly national totals (one intercept per calendar month, shared slope).
    A separate fit uses Terra alone for Nov 2000 - Jun 2002, before Aqua launched.
 4. Extend: before Feb 2012, harmonized = MODIS scaled by the fitted ratio for
    that month; from Feb 2012, harmonized = VIIRS S-NPP observed. NOAA-20,
    calibrated the same way, fills any month S-NPP is missing.
 5. Validate: leave-one-year-out over the overlap. Each year is predicted from a
    model fitted on all other years and compared with what VIIRS observed.
"""
import json
import math
import os
import sys
import time
from datetime import date

import duckdb
import h3
import numpy as np
import pandas as pd

RES = 5
MODIS_MIN_CONF = 30
VIIRS_OK = ("n", "h")
FIRST = (2000, 11)
LAST = (2025, 12)
VIIRS_START = (2012, 2)  # S-NPP record begins 20 Jan 2012; Feb is the first full month
AQUA_START = (2002, 7)


def month_list():
    y, m = FIRST
    out = []
    while (y, m) <= LAST:
        out.append((y, m))
        m += 1
        if m == 13:
            y, m = y + 1, 1
    return out


MONTHS = month_list()
MIDX = {ym: i for i, ym in enumerate(MONTHS)}


def load(firms):
    con = duckdb.connect()
    sql = f"""
    with m as (
      select try_cast(latitude as double) lat, try_cast(longitude as double) lon,
             cast(acq_date as date) d, satellite sat, daynight dn, try_cast(frp as double) frp,
             'M' grp
      from read_csv('{firms}/modis/*.csv', all_varchar=true)
      where type = '0' and try_cast(confidence as int) >= {MODIS_MIN_CONF}
    ), s as (
      select try_cast(latitude as double), try_cast(longitude as double),
             cast(acq_date as date), satellite, daynight, try_cast(frp as double), 'S'
      from read_csv('{firms}/viirs-snpp/*.csv', all_varchar=true)
      where type = '0' and confidence in {VIIRS_OK}
    ), j as (
      select try_cast(latitude as double), try_cast(longitude as double),
             cast(acq_date as date), satellite, daynight, try_cast(frp as double), 'J'
      from read_csv('{firms}/viirs-jpss1/*.csv', all_varchar=true)
      where type = '0' and confidence in {VIIRS_OK}
    )
    select * from m union all select * from s union all select * from j
    """
    df = con.sql(sql).df()
    df.columns = ["lat", "lon", "d", "sat", "dn", "frp", "grp"]
    return df


def main():
    firms = sys.argv[1]
    out = sys.argv[2] if len(sys.argv) > 2 else os.path.join(os.path.dirname(__file__), "..", "web", "public", "data")
    os.makedirs(out, exist_ok=True)
    t0 = time.time()

    df = load(firms)
    print(f"loaded {len(df):,} cleaned detections in {time.time()-t0:.1f}s")
    for g, n in df.groupby("grp").size().items():
        print(f"  {g}: {n:,}")

    # H3 cells (dedupe coordinates first; many repeat)
    coords = df[["lat", "lon"]].drop_duplicates()
    coords["cell"] = [h3.latlng_to_cell(a, b, RES) for a, b in zip(coords.lat.values, coords.lon.values)]
    df = df.merge(coords, on=["lat", "lon"], how="left")
    print(f"gridded to {df.cell.nunique():,} H3 res-{RES} cells in {time.time()-t0:.1f}s")

    df["d"] = pd.to_datetime(df["d"])
    df["mi"] = [MIDX.get((y, m), -1) for y, m in zip(df.d.dt.year.values, df.d.dt.month.values)]
    df = df[df.mi >= 0]
    df["terra"] = (df.grp == "M") & (df.sat == "Terra")

    # fire-active cell-days per group
    def celldays(mask, name):
        x = df.loc[mask, ["cell", "d", "mi"]].drop_duplicates(["cell", "d"])
        return x.groupby(["cell", "mi"]).size().rename(name)

    parts = [
        celldays(df.grp == "M", "m"),       # MODIS, Terra + Aqua
        celldays(df.terra, "t"),            # Terra only
        celldays(df.grp == "S", "s"),       # VIIRS S-NPP
        celldays(df.grp == "J", "j"),       # VIIRS NOAA-20
        celldays(df.grp.isin(["M", "S", "J"]), "n"),  # naive: every sensor thrown together
    ]
    frp = df[df.grp == "M"].groupby(["cell", "mi"]).frp.sum().rename("frp_m")
    cm = pd.concat(parts + [frp], axis=1).fillna(0)
    cm = cm.reset_index()
    print(f"{len(cm):,} cell-month records in {time.time()-t0:.1f}s")

    # national monthly totals
    nat = cm.groupby("mi")[["m", "t", "s", "j", "n"]].sum().reindex(range(len(MONTHS)), fill_value=0)
    nat["y"] = [ym[0] for ym in MONTHS]
    nat["mo"] = [ym[1] for ym in MONTHS]
    overlap = [i for i, ym in enumerate(MONTHS) if ym >= VIIRS_START]
    ov = nat.loc[overlap]

    def fit(pred, target, rows):
        """log(target) = a[month] + b*log(pred); returns a(12), b, sigma, smearing."""
        r = rows[(rows[pred] > 0) & (rows[target] > 0)]
        X = np.zeros((len(r), 13))
        X[np.arange(len(r)), r.mo.values - 1] = 1
        X[:, 12] = np.log(r[pred].values)
        yv = np.log(r[target].values)
        coef, *_ = np.linalg.lstsq(X, yv, rcond=None)
        resid = yv - X @ coef
        sigma = float(np.sqrt(np.sum(resid ** 2) / max(len(r) - 13, 1)))
        smear = float(np.mean(np.exp(resid)))  # Duan smearing: unbiased back-transform
        return {"a": coef[:12].tolist(), "b": float(coef[12]), "sigma": sigma, "smear": smear, "n": int(len(r))}

    def predict(model, pred_val, mo):
        if pred_val <= 0:
            return 0.0
        return math.exp(model["a"][mo - 1] + model["b"] * math.log(pred_val)) * model["smear"]

    model_m = fit("m", "s", ov)
    model_t = fit("t", "s", ov)
    jj = ov[ov.j > 0]
    model_j = fit("j", "s", jj)
    print(f"MODIS->VIIRS slope b={model_m['b']:.3f} sigma={model_m['sigma']:.3f}  "
          f"Terra-only b={model_t['b']:.3f}  NOAA20->SNPP b={model_j['b']:.3f}")

    # ---- leave-one-year-out validation -------------------------------------------------
    years = sorted(set(ov.y))
    val_monthly = []
    for yv in years:
        train = ov[ov.y != yv]
        mdl = fit("m", "s", train)
        for i, row in ov[ov.y == yv].iterrows():
            val_monthly.append({"i": int(i), "y": int(row.y), "mo": int(row.mo),
                                "obs": float(row.s), "pred": predict(mdl, row.m, int(row.mo))})
    vm = pd.DataFrame(val_monthly)
    va = vm.groupby("y")[["obs", "pred"]].sum().reset_index()
    r_month = float(np.corrcoef(vm.obs, vm.pred)[0, 1])
    r_log = float(np.corrcoef(np.log1p(vm.obs), np.log1p(vm.pred))[0, 1])
    r_year = float(np.corrcoef(va.obs, va.pred)[0, 1])
    mape_year = float(np.mean(np.abs(va.pred - va.obs) / va.obs))
    big = vm[vm.obs >= vm.obs.median()]
    mape_month = float(np.median(np.abs(big.pred - big.obs) / big.obs))
    print(f"validation: r(monthly)={r_month:.3f} r(log)={r_log:.3f} r(annual)={r_year:.3f} "
          f"annual MAPE={mape_year:.1%} median monthly APE (busier half)={mape_month:.1%}")

    # ---- harmonize ---------------------------------------------------------------------
    # national harmonized series and per-month scale factor applied to MODIS cell values
    factor = []   # multiply MODIS cell value by this to get VIIRS-equivalent (pre-VIIRS months)
    source = []   # which record the harmonized value comes from
    harm = []
    lo, hi = [], []
    for i, (y, mo) in enumerate(MONTHS):
        row = nat.loc[i]
        if (y, mo) >= VIIRS_START and row.s > 0:
            h = float(row.s); src = "viirs"; f = None; sg = 0.0
        elif (y, mo) >= VIIRS_START and row.j > 0:
            h = predict(model_j, row.j, mo); src = "noaa20"; f = None; sg = model_j["sigma"]
        elif (y, mo) >= AQUA_START:
            h = predict(model_m, row.m, mo); src = "modis"; f = h / row.m if row.m else 0; sg = model_m["sigma"]
        else:
            h = predict(model_t, row.t, mo); src = "terra"; f = h / row.t if row.t else 0; sg = model_t["sigma"]
        factor.append(None if f is None else round(f, 4))
        source.append(src)
        harm.append(round(h, 1))
        lo.append(round(h * math.exp(-1.645 * sg), 1))
        hi.append(round(h * math.exp(1.645 * sg), 1))

    # ---- export ------------------------------------------------------------------------
    cells = sorted(cm.cell.unique())
    cidx = {c: i for i, c in enumerate(cells)}
    centers = [h3.cell_to_latlng(c) for c in cells]
    # per-month sparse arrays: [cellIdx, modis, naive, harmonized x10]
    # harmonized per cell: VIIRS observed where available, otherwise MODIS (or Terra
    # before Aqua) scaled by that month's national calibration factor.
    by_month = [[] for _ in MONTHS]
    for r in cm.itertuples(index=False):
        i = r.mi
        src = source[i]
        if src == "viirs":
            hv = r.s
        elif src == "noaa20":
            hv = predict(model_j, nat.loc[i].j, MONTHS[i][1]) * (r.j / nat.loc[i].j) if nat.loc[i].j else 0
        elif src == "modis":
            hv = r.m * factor[i]
        else:
            hv = r.t * factor[i]
        if r.m == 0 and r.n == 0 and hv == 0:
            continue
        by_month[i].append([cidx[r.cell], int(r.m), int(r.n), int(round(hv * 10))])

    meta = {
        "title": "BRASA harmonized burning activity, Argentina",
        "generated": date.today().isoformat(),
        "h3_resolution": RES,
        "unit": "fire-active cell-days (H3 res-5 hexagons with >=1 detection on a day)",
        "months": [f"{y}-{m:02d}" for y, m in MONTHS],
        "viirs_start": f"{VIIRS_START[0]}-{VIIRS_START[1]:02d}",
        "aqua_start": f"{AQUA_START[0]}-{AQUA_START[1]:02d}",
        "factor": factor,
        "source": source,
        "national": {"modis": nat.m.astype(int).tolist(), "terra": nat.t.astype(int).tolist(),
                     "snpp": nat.s.astype(int).tolist(), "noaa20": nat.j.astype(int).tolist(),
                     "naive": nat.n.astype(int).tolist(), "harmonized": harm, "lo": lo, "hi": hi},
        "models": {"modis_to_viirs": model_m, "terra_to_viirs": model_t, "noaa20_to_snpp": model_j},
        "cleaning": {"type": 0, "modis_min_confidence": MODIS_MIN_CONF, "viirs_confidence": list(VIIRS_OK)},
        "sources": [
            "NASA FIRMS MODIS Collection 6.1 Active Fire (MCD14ML), Terra and Aqua",
            "NASA FIRMS VIIRS 375 m Active Fire (VNP14IMG), Suomi NPP",
            "NASA FIRMS VIIRS 375 m Active Fire (VJ114IMG), NOAA-20",
        ],
    }
    validation = {
        "method": "leave-one-year-out over the 2012-2025 MODIS/VIIRS overlap",
        "r_monthly": r_month, "r_log_monthly": r_log, "r_annual": r_year,
        "mape_annual": mape_year, "median_ape_monthly_busy": mape_month,
        "annual": [{"year": int(a.y), "obs": round(a.obs), "pred": round(a.pred)} for a in va.itertuples()],
        "monthly": [{"m": f"{v.y}-{v.mo:02d}", "obs": round(v.obs), "pred": round(v.pred)} for v in vm.itertuples()],
    }
    cells_out = {"cells": cells, "centers": [[round(a, 3), round(b, 3)] for a, b in centers],
                 "fields": ["cell", "modis", "naive", "harmonized_x10"], "months": by_month}

    for name, obj in [("meta.json", meta), ("validation.json", validation), ("cells.json", cells_out)]:
        p = os.path.join(out, name)
        with open(p, "w") as f:
            json.dump(obj, f, separators=(",", ":"))
        print(f"wrote {p} ({os.path.getsize(p)/1e6:.2f} MB)")
    print(f"done in {time.time()-t0:.1f}s")


if __name__ == "__main__":
    main()
