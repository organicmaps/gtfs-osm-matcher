// Parsing of the report's `index.tsv` — the one file loaded eagerly per region.
//
// Columns are resolved by header name, never by position, so a report whose column
// layout differs still loads. Positional parsing fails silently rather than loudly:
// a shifted column is read as a coordinate or a byte offset and produces a bad
// range request instead of an error.
//
// Only `gtfs:id`, `type`, `lon`, `lat`, `byte_start`, `byte_end` and a category column
// are required. `status` is optional — it repeats what the category already implies —
// and so is `strategies`. `line` and `search_terms` are there for reading the file by
// hand and are not used here.
//
// The category column is `kind` in current reports and was `status_detailed` in older
// ones, which also folded the match strategies into it (`mid`, `mrt`, `mnm`, `nic`).
// Both are accepted: a report is one row per stop either way, and reading an older one
// should not need an older build.

/** What was true about a match. Several can hold for one stop. */
export type Strategy = 'id' | 'routes' | 'name' | 'conflict' | 'narrowed';

export const STRATEGIES: { key: Strategy; label: string; help: string }[] = [
    { key: 'id', label: 'by id', help: 'Matched by GTFS id or code' },
    { key: 'routes', label: 'by routes', help: 'Matched by routes going through the stop' },
    { key: 'name', label: 'by name', help: 'Matched by name' },
    { key: 'conflict', label: 'id conflict', help: 'Matched by name, but an id on the OSM feature disagrees' },
    { key: 'narrowed', label: 'narrowed by routes', help: 'The routes cut the answer down to the features they serve' },
];

/**
 * Bits of the `strategies` column. An integer, because several strategies hold at once
 * and the index is the one file loaded eagerly — a stop matched by id, routes and name
 * costs three bits rather than three rows.
 */
const STRATEGY_BITS: { bit: number; key: Strategy }[] = [
    { bit: 1, key: 'id' },
    { bit: 2, key: 'routes' },
    { bit: 4, key: 'name' },
    { bit: 8, key: 'conflict' },
    { bit: 16, key: 'narrowed' },
];

/**
 * Without that column the strategy is recoverable from the `status_detailed` code.
 * The codes are mutually exclusive — a stop carries exactly one — so each maps to a
 * single strategy and none is inferred on top: `nic` is its own verdict, not a name
 * match with a flag, and counting it as both would count the stop twice.
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

export type IndexRow = {
    id: string
    /** `m` | `n`, or empty when the report omits the column. */
    status: string
    /** The `status_detailed` code. */
    code: string
    type: string
    lon: number
    lat: number
    byteStart: number
    byteEnd: number
    strategies: Strategy[]
}

const REQUIRED = ['gtfs:id', 'type', 'lon', 'lat', 'byte_start', 'byte_end'];

/** `kind` in current reports, `status_detailed` in older ones. */
const CATEGORY_COLUMNS = ['kind', 'status_detailed'];

function parseStrategies(cell: string | undefined, code: string): Strategy[] {
    const bits = cell === undefined ? NaN : parseInt(cell, 10);

    if (!Number.isFinite(bits)) {
        // No strategies column: an older report folded the strategy into the category.
        return CODE_STRATEGIES[code] || [];
    }

    return STRATEGY_BITS.filter(s => (bits & s.bit) !== 0).map(s => s.key);
}

export function parseIndex(tsv: string): IndexRow[] {
    const lines = tsv.split('\n');
    if (lines.length === 0 || !lines[0]) return [];

    const header = lines[0].split('\t');
    const at: { [name: string]: number } = {};
    header.forEach((name, i) => at[name.trim()] = i);

    const missing = REQUIRED.filter(name => at[name] === undefined);
    const categoryColumn = CATEGORY_COLUMNS.find(name => at[name] !== undefined);

    if (missing.length > 0 || categoryColumn === undefined) {
        const wanted = missing.concat(categoryColumn === undefined ? [CATEGORY_COLUMNS.join('|')] : []);
        console.error('index.tsv is missing required columns:', wanted.join(', '));
        return [];
    }

    // The furthest column any row must reach to be usable.
    const lastNeeded = Math.max(...REQUIRED.map(name => at[name]), at[categoryColumn]);

    const rows: IndexRow[] = [];
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i];
        if (!line) continue;
        const c = line.split('\t');
        // A row truncated before a required column cannot be placed or fetched.
        if (c.length <= lastNeeded) continue;

        const code = c[at[categoryColumn]];
        rows.push({
            id: c[at['gtfs:id']],
            status: at['status'] !== undefined ? c[at['status']] : '',
            code,
            type: c[at['type']],
            lon: parseFloat(c[at['lon']]),
            lat: parseFloat(c[at['lat']]),
            byteStart: parseInt(c[at['byte_start']], 10),
            byteEnd: parseInt(c[at['byte_end']], 10),
            strategies: parseStrategies(at['strategies'] !== undefined ? c[at['strategies']] : undefined, code),
        });
    }
    return rows;
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
