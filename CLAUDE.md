This file provides guidance to AI agents when working with code in this repository. `AGENTS.md` is a symlink to this file (same convention as the main Organic Maps repo). See also [README.md](README.md) (project purpose, match categories, contribution info) and [docs/component-tree.md](docs/component-tree.md) (full component/layout tree — keep it updated when moving components).

## What this is

A browser SPA for the Organic Maps project that visualizes and validates the matching of **GTFS public-transport stops to OpenStreetMap stops**, and helps fix mismatches: besides inspecting pre-computed match results on a map, a user can edit OSM stop tags, move stops, create new ones, and download the edits as a JOSM-compatible `.osm` file. It also previews GTFS timetables with live (GTFS-RT) delays.

Data sources (no backend of its own):
- Static match data under `DATA_BASE_URL` (`src/config.ts`: `VITE_DATA_BASE_URL` env, prod `https://pt.organicmaps.app/data` via `.env.production`, dev default `/data` proxied by Vite) — produced by the sibling `../gtfs-parser` project (separate repo).
- Schedules API: `http://localhost:4567/v1/{schedule,updates}` in dev, `https://pt.organicmaps.app/api/v1/…` in prod (hardcoded in `schedule-preview.tsx`).
- Live OSM data: Overpass API (per-tile stop queries) and `api.openstreetmap.org/api/0.6` (elements by id) via `src/services/OsmQuerryQueue.ts`.
- Map tiles: OpenFreeMap "bright" style + Esri world imagery (`src/map/styling.ts`; the satellite style borrows OpenFreeMap sprite/glyphs so symbol layers keep working).

Stack: Preact 10 + Vite 7 + TypeScript 5.9 (strict) + MapLibre GL 5. **Yarn 4 via corepack** (`packageManager` in package.json).

## Commands

```bash
yarn dev          # Vite dev server (proxies /data -> http://localhost:8801, stripping the /data prefix)
yarn serve-data   # http-server for ../gtfs-parser/data/match on :8801 --cors
yarn build        # tsc -b && vite build  (type-check gates the build; also what CI runs)
yarn preview      # serve the production build
```

CI (`.github/workflows/build.yml`) runs `yarn install --immutable && yarn build` on every push/PR. `yarn deploy` runs `./scripts/deploy.sh` — `scripts/` is deliberately gitignored (local-only), so don't rely on it. Deployment is Cloudflare static assets from `./dist` (`wrangler.jsonc`); a custom Vite plugin (`selectiveOutDirCleanup` in `vite.config.ts`) preserves `dist/data` across builds so match data can be colocated.

There are no tests and no ESLint. The only static check is `tsc -b`. The `tsconfig`s are strict and include `noUnusedLocals`/`noUnusedParameters`/`noFallthroughCasesInSwitch`, so dead code and unused params **fail the build** — clean these up rather than leaving them.

## Data contract (the heart of the app)

- `GET {DATA_BASE_URL}/match-report.json?t=<now>` → `{ matchedRegions: Report[], foldByName: string[] }` — region list with per-region `matchStats`, `idTags` (which OSM tags hold GTFS ids, with counts — drives the editor's Set Id/Code defaults), `matchMeta` (timestamps, bbox, sources), `liveUpdates`; `foldByName` holds region-name prefixes the report table folds into groups. See `Report` in `src/uielements/report.tsx`. (There is no separate update-report.json anymore.)
- `GET {DATA_BASE_URL}/{region}/index.tsv?t=<now>` → one row per GTFS stop: `id, status (m|…), code, type, lon, lat, byteStart, byteEnd, search_terms(ignored)`. `code` is the 3-letter sub-category (`status_detailed`), `type` picks the detail file.
- Stop details are **NDJSON fetched with HTTP `Range` headers**: `type` → `matches.ndjson` / `clusters.ndjson` / `no-osm.ndjson` (`fileFor` in `report.tsx`), byte offsets from the index row. The detail JSON becomes the selected feature's properties.
- `GET {DATA_BASE_URL}/{region}/routes.ndjson` → route index (with `byteOffset`/`byteLength`); `route-stops.ndjson` is then Range-fetched per route for variants + polylines (`route-list.tsx`, with module-level promise caches).
- `GET {DATA_BASE_URL}/{region}/preview.geojson` → stops for the timetable-preview overlay.
- Schedules API: `GET …/schedule/{stopId}` returns `formatVersion: '4'` — a compact stop-centric format (deduplicated arrays, VLQ/base64url `pos` blobs, bit-vector service periods) decoded by `src/services/ScheduleEncoding.ts`; the format is documented in `src/services/schedule.types.d.ts`. `GET …/updates/{stopId}` (GTFS-RT delays) is polled every 5 s only when `feedMeta.liveUpdates`, and gives up after 3 errors.

**Match categories** are keyed by the 3-letter `code`: `CATEGORIES` in `report.tsx` (group matched/not-matched, label, color, help) and `MATCH_LABELS` in `selection-info.tsx`. Adding/renaming a category means touching both, and the pipeline that writes index.tsv.

GeoJSON feature `properties` carry nested data **as JSON strings** (e.g. `osmFeatures`, `gtfsFeatures`, `gtfsRoutes`). `stringifyProperties` in `report.tsx` enforces this when a feature flows into selection state, and the panels `JSON.parse` it back (`parseJsonSafe`). Preserve this string-encoding when adding fields — MapLibre feature properties can't hold nested objects.

Gotcha: in `matchMeta.gtfsBbox`, `top` is the **south** latitude and `bottom` the north (see `region-markers.tsx`).

## Architecture

Component/layout tree, side-panel tabs, and context consumers are documented in [docs/component-tree.md](docs/component-tree.md). The essentials:

**Global state** (`src/app.tsx`):
- `MapContext` → `{ map, loaded: Promise<Map>, layerControls }`. Await `loaded` before adding images/overlays — don't race `map.loaded()`.
- `SelectionContext` → `{ selection, selectionSource, updateSelection(sel, source), onReportSelect }`. `selectionSource` (`'map-click' | 'url-hash' | …`) matters: e.g. only `url-hash` selections trigger a flyTo.
- `OSM_DATA` (`src/services/OSMData.ts`) — singleton store of live OSM elements + tracked edits (create node with negative id, move, change tags), consumed via `subscribe` + `useSyncExternalStore`. `OSM_QUERY_QUEUE` fills it from Overpass (z16 tiles, deduped, 1 s throttle) and the OSM API.

**Hash routing, bidirectionally synced** (`src/uielements/routing.ts`):
- URL shape: `#/match-report/{region}` plus `/selection/{id}` or `/preview/{id}`. The category is **not** in the URL — deep links recover it from the region's index.tsv row.
- `useHash()`/`useHashRoute(parser)` are the read direction; a `useEffect` on `selection` in `app.tsx` writes the hash. Keep both directions in mind when touching selection logic.
- Cross-component signal: `onReportSelect` dispatches a `ShouldUpdateBounds` window event; `report.tsx` listens at module level to arm a one-shot `fitBounds` to the region bbox.

**Map rendering:**
- `src/map/map.ts` `createMap()` builds the MapLibre instance, persists viewport to `localStorage['map-location']`, exposes `window.map` / `window.layerControls` for console debugging, and wires the `#map-style-button` / `#map-location` DOM that `MapTools` renders (it works because `createMap` runs in a post-render `useEffect`).
- `LayerControls` (`src/map/layers-controls.ts`) swaps base styles (`cycleBaseStyle`) while re-applying registered overlays; everything map-drawn goes through `addOverlayImmediate`/`removeOverlayImmediate` so it survives style switches.
- `StopsLayer` (`report.tsx`) is **one** source/symbol layer for all of a region's stops; category toggles use `map.setFilter` on `subcategory` (never rebuild the source), icons are data-driven `stop-{code}` images recolored from `/stop-var.svg` by `loadSvgWithColors`. It also mutates the stored overlay spec's `filter` in place so base-style switches re-apply the current filter.
- Render-less overlay components follow one idiom: build the overlay spec, `mapLoaded.then(...)` guarded by a `subscription = { canceled, promiseFulfiled }` object, clean up in the effect teardown. See `StopsLayer`, `DatasetMapLayer` (preview), `RegionMarkersLayer`, `MatchArrowLayer`, `RoutesMap` (which instead keeps a persistent `routes` source and `setData`s into it), `HtmlMapMarker` (`editor/map-marker.tsx`).

**Selection panel** (`selection-info.tsx`): unified `MatchInfo` for all categories (clusters are just `gtfsFeatures.length > 1`), with `RouteList` (route pills + variants drawn via `RoutesMap`), match arrows, distances (`src/map/distance.ts`), and the editor: `TagEditor` (`editor/osm-tags.tsx`), Set Name/Id/Code quick actions, `MoveController`, `AddOsmStopController` (creates a node with proper PT tags per route type), plus "Surrounding OSM Features" from Overpass within 500 m. Edits accumulate in `OSM_DATA.changes`; the Changes tab (`editor/changes.tsx`) exports them as `gtfs-changes.osm` (JOSM-loadable XML). An `mtch` field on an OSM candidate warns it is already matched to another GTFS stop.

## Conventions

- **Preact, not React.** `react`/`react-dom` are aliased to `preact/compat` (tsconfig paths + `@preact/preset-vite`). Import hooks from `preact/hooks`; `useSyncExternalStore`/`createPortal` come from `preact/compat`.
- Debug logging is guarded: `import.meta.env.DEV && console.log(...)`. Bare `console.warn/error` only for real problems. Follow this, not the older unguarded style.
- Render-less effect components are the pattern for imperative MapLibre objects — set up in `useEffect`, return a cleanup, use the `subscription.canceled` guard around async setup. Don't mutate the map ad hoc.
- Module-level promise caches for per-region fetches (`route-list.tsx`) and singletons for services (`OSM_DATA`, `OSM_QUERY_QUEUE`).
- Types use a `…T` suffix (`SelectionT`, `FeedMetaT`); newer service types drop it (`Schedule`, `OSMElement`) — match the file's neighbors. `cls()` (`uielements/cls.ts`) joins conditional class names.
- No formatter is configured; indentation varies by file (2 spaces in `app.tsx`, 4 in most others) — match the file you're editing.
- Comments should be brief, explaining only reasoning that is not obvious from the code itself.
- A few `@ts-ignore`s exist around MapLibre's style typings; that's tolerated there, not an invitation to add more elsewhere.

## Error handling policy

Match data comes from our own pipeline and is trusted: fail visibly in the console rather than adding defensive fallbacks or schema validation for inputs that can only be wrong due to a pipeline bug (`parseJsonSafe` exists only for genuinely optional properties). Third-party live services (Overpass, OSM API, schedules API) **do** get guarded: catch, log, and degrade (see the trip-updates 3-strike cutoff and `OsmQuerryQueue`'s try/catch + throttle) — never hammer them in a retry loop.

## Main focus

- Simplicity and less code: prefer the smallest change that works; no new dependencies (the runtime deps are exactly `preact` and `maplibre-gl` — even XML encoding is hand-rolled) or state/router libraries.
- Performance on big regions: thousands of stops ride in one filtered source; details, routes, and schedules are lazy (Range requests, promise caches, compact encodings). Keep new data paths lazy too, and clean up overlays/markers on unmount.
- Keep `docs/component-tree.md` in sync when adding/moving components.

## Commits and pull requests

- Summary in imperative mood, max ~120 chars; separate subject from body with a blank line; explain what and why, not how, briefly.
- Keep PRs focused and small, with brief descriptions; split unrelated changes.
- Validate all findings and proposals on the existing codebase if applicable.
