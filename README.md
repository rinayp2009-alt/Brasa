# BRASA · Harmonized Burning Activity Calendar

**NASA Space Apps Challenge 2026 · Harmonization of MODIS and VIIRS Hot Spots**

BRASA turns 25 years of NASA satellite fire detections over Argentina into one consistent burning-activity calendar. Satellites have tracked fires since 2000, but the record is split between MODIS (1 km, since 2000) and VIIRS (375 m, since 2012). VIIRS sees many more small fires, so simply adding the two makes fire activity look like it doubled in 2012. BRASA calibrates MODIS to VIIRS on the years both flew, giving responders, scientists and land managers one record they can trust.

## What you can do
- Pick an area (preset regions or draw your own box) and see its monthly burning calendar, 2000–2025
- Spot extreme months: each month is compared with the same month in every other year
- See the fire season (start, peak, end) for any area
- Toggle **Raw MODIS / naive MODIS+VIIRS / Harmonized** to watch the fake 2012 jump appear and disappear
- Play the map through 25 years of fires

## Method
1. **Clean**: vegetation fires only (type 0); MODIS confidence ≥ 30; VIIRS nominal or high.
2. **Grid**: each detection is assigned to an H3 hexagon (resolution 5, ~252 km²). Activity is counted as fire-active hexagon-days, which removes most of the pixel-size difference between sensors.
3. **Calibrate**: on 2012–2025, `log(VIIRS) = a[month] + b·log(MODIS)` on monthly totals (one intercept per calendar month, shared slope, Duan smearing for the back-transform). Terra alone is calibrated separately for Nov 2000–Jun 2002, before Aqua.
4. **Extend**: before 2012, MODIS values are scaled to VIIRS-equivalent; from 2012, VIIRS S-NPP is used directly, with NOAA-20 calibrated to fill gaps.
5. **Validate**: leave-one-year-out over the overlap → annual r = 0.985, mean annual error 3.8%.

## Data (all NASA)
- NASA FIRMS MODIS Collection 6.1 active fire archive (Terra, Aqua)
- NASA FIRMS VIIRS 375 m active fire archive (Suomi NPP, NOAA-20)
- NASA GIBS VIIRS Black Marble (basemap)

## Run it
```
python pipeline/build_data.py path/to/firms web/public/data   # rebuild data (needs duckdb, h3, pandas, numpy)
cd web && npm install && npm run dev                          # start the app
```

## Use of AI
Code was written with help from Claude (Anthropic), an AI assistant, and reviewed and directed by the author.
