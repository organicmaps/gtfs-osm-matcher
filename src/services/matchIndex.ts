// Parsing of the report's `index.tsv` — the one file loaded eagerly per region — and the
// vocabulary the report and the selection panel share: what a stop is (`CATEGORIES`) and
// what was true about its match (`STRATEGIES`).
//
// Columns are resolved by header name, never by position, so a report whose column
// layout differs still loads. Positional parsing fails silently rather than loudly:
// a shifted column is read as a coordinate or a byte offset and produces a bad
// range request instead of an error.
//
// Only `gtfs:id`, `type`, `lon`, `lat`, `byte_start`, `byte_end` and a category column
// are required. `status`, `line`, `search_terms` and `strategies` are there for reading
// the file by hand and for
// a facet that does not exist yet; the panel's strategy badges come from the detail body,
// which names them, so nothing here decodes the column.
//
// The category column is `kind` in current reports and was `status_detailed` in older
// ones, which also folded the match strategies into it (`mid`, `mrt`, `mnm`, `nic`).
// Both are accepted: a report is one row per stop either way, and reading an older one
// should not need an older build.

/** What was true about a match. Several can hold for one stop. */
export type Strategy = 'id' | 'routes' | 'name' | 'platform' | 'area' | 'conflict' | 'narrowed';

/**
 * In the order the detail body writes them, so a stop's badges read the same way twice.
 * These are the seven the matcher can report; a report that grows an eighth shows it as
 * nothing until it is named here.
 */
export const STRATEGIES: { key: Strategy; label: string; help: string }[] = [
    { key: 'id', label: 'by id', help: 'Matched by GTFS id or code' },
    { key: 'routes', label: 'by routes', help: 'Matched by routes going through the stop' },
    { key: 'name', label: 'by name', help: 'Matched by name' },
    { key: 'platform', label: 'by platform', help: 'The stop’s platform code matched a bay’s local_ref or ref within its station' },
    { key: 'area', label: 'by stop_area', help: 'A stop_area relation put the stop in a station' },
    { key: 'conflict', label: 'id conflict', help: 'Matched by name, but the OSM feature carries a different GTFS id' },
    { key: 'narrowed', label: 'narrowed by routes', help: 'Routes narrowed the candidates to the features they serve' },
];

/**
 * The strategies an older report's `status_detailed` code implies, for callers holding
 * only a code. The codes are mutually exclusive — a stop carries exactly one — so each
 * maps to a single strategy and none is inferred on top: `nic` is its own verdict, not a
 * name match with a flag, and counting it as both would count the stop twice.
 */
const CODE_STRATEGIES: { [code: string]: Strategy[] } = {
    mid: ['id'],
    mrt: ['routes'],
    mnm: ['name'],
    nic: ['conflict'],
};

/** The strategies a `status_detailed` code implies, for callers holding only a code. */
export function strategiesForCode(code: string): Strategy[] {
    return CODE_STRATEGIES[code] || [];
}

// Category model, keyed by the index's 3-letter code. Two top-level groups
// (matched / not-matched); the rest are sub-categories. One table, because the report's
// checkboxes want `group` and `color` while the selection panel wants `label` and `help`,
// and two copies of the same twelve rows drift word by word.
export type Group = 'matched' | 'not-matched';
export type Category = {
    group: Group;
    label: string;
    color: string;
    help: string;
};

export const CATEGORIES: { [code: string]: Category } = {
    mat: { group: 'matched', label: 'match', color: 'green', help: 'Matched to one or more OSM features; the badges say how' },
    // Older reports split a match across these four by strategy, one row each; current
    // ones use `mat` and name the strategies separately. Kept so an old report still renders.
    mid: { group: 'matched', label: 'match-id', color: 'green', help: 'Stop matched by GTFS id or code' },
    mrt: { group: 'matched', label: 'match-routes', color: 'green', help: 'Stop matched by routes going through it' },
    mnm: { group: 'matched', label: 'match-name', color: 'green', help: 'Stop matched by name' },
    nic: { group: 'matched', label: 'name-id-conflict', color: 'green', help: 'Stop matched by name but mismatched by id' },
    gen: { group: 'matched', label: 'match-generic', color: 'green', help: 'Matched to a nearby OSM stop that has neither a name nor a code' },
    sep: { group: 'matched', label: 'separated-cluster', color: '#467d18', help: 'Many OSM stops matched one or many GTFS stops, and were successfully separated' },
    clu: { group: 'matched', label: 'cluster', color: '#80520e', help: 'Many OSM stops matched one or many GTFS stops by name' },
    mto: { group: 'matched', label: 'many-to-one', color: '#93cf32ff', help: 'Many OSM stops matched exactly one GTFS stop by name' },
    hub: { group: 'matched', label: 'transit-hub', color: '#b5b20bff', help: 'Many OSM platforms or stops matched one station by name' },
    nom: { group: 'not-matched', label: 'no-match', color: 'red', help: 'No OSM element matched' },
    nos: { group: 'not-matched', label: 'no-osm', color: 'black', help: 'No OSM element of a compatible transport mode was found in the area' },
};

export const CATEGORY_CODES = Object.keys(CATEGORIES);

export type IndexRow = {
    id: string
    /** The category code. */
    code: string
    type: string
    lon: number
    lat: number
    byteStart: number
    byteEnd: number
}

const REQUIRED = ['gtfs:id', 'type', 'lon', 'lat', 'byte_start', 'byte_end'];

/** `kind` in current reports, `status_detailed` in older ones. */
const CATEGORY_COLUMNS = ['kind', 'status_detailed'];

/** Rows this build could use, and how many it could not. */
export type ParsedIndex = {
    rows: IndexRow[]
    /** Rows dropped as truncated or unparseable. See {@link parseIndex}. */
    skipped: number
}

/**
 * Throws on a header this build cannot read. An unreadable index and a region with no
 * stops produce the same empty map, so the caller is given something to say instead.
 *
 * <p>Individual rows are counted rather than thrown on: one bad row should not cost the
 * region, but it must not vanish either. A row whose `lon` is not a number becomes a NaN
 * coordinate MapLibre silently drops, and one whose `byte_start` is not a number becomes
 * a `bytes=NaN-NaN` range request that 416s on click -- both look exactly like a report
 * that is simply missing stops.
 */
export function parseIndex(tsv: string): ParsedIndex {
    const lines = tsv.split('\n');
    if (lines.length === 0 || !lines[0]) {
        throw new Error('index.tsv is empty');
    }

    const header = lines[0].split('\t');
    const at: { [name: string]: number } = {};
    header.forEach((name, i) => at[name.trim()] = i);

    const missing = REQUIRED.filter(name => at[name] === undefined);
    const categoryColumn = CATEGORY_COLUMNS.find(name => at[name] !== undefined);

    if (missing.length > 0 || categoryColumn === undefined) {
        const wanted = missing.concat(categoryColumn === undefined ? [CATEGORY_COLUMNS.join('|')] : []);
        throw new Error(`index.tsv is missing required columns: ${wanted.join(', ')}`);
    }

    // The furthest column any row must reach to be usable.
    const lastNeeded = Math.max(...REQUIRED.map(name => at[name]), at[categoryColumn]);

    const rows: IndexRow[] = [];
    let skipped = 0;
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i];
        if (!line) continue;
        const c = line.split('\t');
        // A row truncated before a required column cannot be placed or fetched.
        if (c.length <= lastNeeded) {
            skipped++;
            continue;
        }

        const lon = parseFloat(c[at['lon']]);
        const lat = parseFloat(c[at['lat']]);
        const byteStart = parseInt(c[at['byte_start']], 10);
        const byteEnd = parseInt(c[at['byte_end']], 10);

        if (!Number.isFinite(lon) || !Number.isFinite(lat)
            || !Number.isFinite(byteStart) || !Number.isFinite(byteEnd)) {
            skipped++;
            continue;
        }

        rows.push({
            id: c[at['gtfs:id']],
            code: c[at[categoryColumn]],
            type: c[at['type']],
            lon,
            lat,
            byteStart,
            byteEnd,
        });
    }
    return { rows, skipped };
}

/**
 * Which detail file a row's body lives in. A report may split details by row shape
 * or keep them in one file; an unrecognised type falls back to the combined file
 * rather than dropping the row.
 */
const FILE_FOR_TYPE: { [type: string]: string } = {
    mat: 'matches.ndjson',
    clu: 'clusters.ndjson',
    nos: 'no-osm.ndjson',
};

export const COMBINED_REPORT_FILE = 'report.ndjson';

export function detailFileFor(type: string): string {
    return FILE_FOR_TYPE[type] || COMBINED_REPORT_FILE;
}
