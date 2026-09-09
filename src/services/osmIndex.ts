// The report read from the OSM side: one row per feature the matcher was offered as a
// candidate for some stop, and what the GTFS side made of it.
//
// Fetched only when Preview is on, and once per region. It is the largest file the report
// publishes — the pool is nearly twice the stop count — so it is written gzipped and never
// loaded with the index: swiss-opendata is 11.6 MB of text and 3.3 MB on the wire.
//
// Decompressed here rather than by the web server, which compresses only text/html and is
// not ours to configure. `DecompressionStream` is native; a report served with
// `Content-Encoding: gzip` would arrive already unwrapped, so the magic bytes decide.

import { DATA_BASE_URL } from "../config";

export type OsmIndexRow = {
    osmId: string
    lon: number
    lat: number
    /** stop / station / platform / position, as the matcher read it off the tags. */
    flavour: string
    /** How many GTFS stops were offered this feature as a candidate. */
    seenBy: number
    /** How far the nearest of those stands, in metres. */
    nearestM: number
    /** How many GTFS stops matched it, by any tier. */
    matched: number
    /** How many the anchoring actually placed here. */
    anchored: number
    name: string
};

const REQUIRED = ['osm:id', 'lon', 'lat', 'gtfs_matched', 'gtfs_anchored'];

/**
 * The response body as text, gunzipped unless the server already did it.
 *
 * A server configured with `gzip_static` or a matching `gzip_types` unwraps the body itself
 * and `res.text()` is the file; ours does neither, so the bytes arrive as they were written.
 * Sniffing the two magic bytes covers both without asking the caller to know which.
 */
async function gunzip(res: Response): Promise<string> {
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes[0] !== 0x1f || bytes[1] !== 0x8b) {
        return new TextDecoder().decode(bytes);
    }
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
    return new Response(stream).text();
}

/**
 * The OSM stops and stations the matcher was offered and nothing matched.
 *
 * <p>Null where the region's report has no such file — one written before the matcher
 * recorded its candidate pool. An absence, not a failure: the map then has nothing to draw
 * and says so with an empty count.
 */
export async function loadUnmatchedOsmStops(region: string): Promise<OsmIndexRow[] | null> {
    return cache[region] ??= fetchRegion(region);
}

const cache: { [region: string]: Promise<OsmIndexRow[] | null> } = {};

async function fetchRegion(region: string): Promise<OsmIndexRow[] | null> {
    // The small file, not the pool: the report writes the stops and stations nothing matched
    // as their own file precisely so a map can draw them without fetching what the matcher
    // looked at. germany-local is 67,428 rows here against 732,315 there.
    const res = await fetch(`${DATA_BASE_URL}/${region}/osm-index-stops.tsv.gz`);
    if (res.status === 404) {
        return null;
    }
    if (!res.ok) {
        throw new Error(`${res.status} for osm-index-stops.tsv.gz`);
    }

    const lines = (await gunzip(res)).split('\n');
    const at: { [name: string]: number } = {};
    (lines[0] || '').split('\t').forEach((name, i) => at[name.trim()] = i);

    const missing = REQUIRED.filter(name => at[name] === undefined);
    if (missing.length > 0) {
        throw new Error(`osm-index.tsv is missing columns: ${missing.join(', ')}`);
    }

    const rows: OsmIndexRow[] = [];
    for (let i = 1; i < lines.length; i++) {
        if (!lines[i]) continue;
        const c = lines[i].split('\t');


        const lon = parseFloat(c[at['lon']]);
        const lat = parseFloat(c[at['lat']]);
        if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;

        rows.push({
            osmId: c[at['osm:id']],
            lon,
            lat,
            flavour: at['flavour'] !== undefined ? c[at['flavour']] : '',
            seenBy: at['gtfs_seen_by'] !== undefined ? parseInt(c[at['gtfs_seen_by']], 10) : 0,
            nearestM: at['nearest_m'] !== undefined ? parseFloat(c[at['nearest_m']]) : NaN,
            matched: 0,
            anchored: parseInt(c[at['gtfs_anchored']], 10) || 0,
            name: at['name'] !== undefined ? c[at['name']] : '',
        });
    }
    return rows;
}
