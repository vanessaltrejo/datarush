# Dashboard: bikes needed per station

Static Next.js dashboard for the DataRush Citi Bike challenge (Jersey City and Hoboken).
It reads the model outputs in `../outputs` and the raw trip files in the repo root. It does not change the model.
The UI is in Spanish. Code and docs are in English.

## Run it

Requires Node 20 or newer (22 LTS recommended).

```bash
npm install
npm run build
npm run preview
```

Open http://localhost:3000. For the live demo, always use the production build, not `npm run dev`.

`npm run build` first runs `scripts/prepareData.mjs`, which checks every row count and writes `public/data/*.json`.
If a count does not match, the build stops.
The generated JSON is committed, so a deploy works even if `../outputs` is not reachable.
In that case the script keeps the committed files and stops without error.

## Deploy on Vercel

1. Import the GitHub repo.
2. Set **Root Directory** to `dashboard`.
3. Framework preset: **Next.js**. Leave the build and output settings as they are.
4. No environment variables are needed.
5. Node version: 22.x (set in `package.json`).

The site is a static export (`output: 'export'`), so there is no server and no API key.

## Folder structure

```
scripts/prepareData.mjs   reads ../outputs/*.csv and ../JC-*.csv, validates counts, writes public/data
public/data/              generated JSON (committed, so deploys do not need the source files)
src/app/                  layout and the single page
src/services/             dataService.ts is the only place that loads data (zod validation, maps to camelCase)
src/types/domain.ts       domain types
src/state/                React context: mode, date, window, level, selected station
src/lib/                  selectors, formatters, color scales, Spanish labels
src/components/           layout/, map/ (Leaflet), charts/ (ECharts), panels/ (the three tabs)
```

## Data notes

- Base map tiles come from OpenStreetMap and need internet. Without it, markers still draw.
- Derived fields added by the script: station status, weekday net flow per window, balance role, member and casual trips.
- Hourly detail exists only for August and September 2026. Forecast days show a typical day from the full-year profile.
