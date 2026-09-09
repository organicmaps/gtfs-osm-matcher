// The report read from the OSM side: one row per feature the matcher was offered as a
// candidate for some stop, and what the GTFS side made of it.
//
// Fetched only when Preview is on, and once per region. It is the largest file the report
// publishes — 11.6 MB for swiss-opendata, against 9.3 MB for index.tsv — because the pool is
// nearly twice the stop count, so it must never be loaded with the index.

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
 * The features nothing matched: what the matcher looked at and did not use.
 *
 * <p>Null where the region's report has no `osm-index.tsv` — a report written before the
 * matcher recorded its candidate pool. That is an absence, not a failure: Preview then shows
 * what it always did.
 */
export async function loadUnassignedOsmFeatures(region: string): Promise<OsmIndexRow[] | null> {
    return cache[region] ??= fetchRegion(region);
}

const cache: { [region: string]: Promise<OsmIndexRow[] | null> } = {};

async function fetchRegion(region: string): Promise<OsmIndexRow[] | null> {
    const res = await fetch(`${DATA_BASE_URL}/${region}/osm-index.tsv`);
    if (res.status === 404) {
        return null;
    }
    if (!res.ok) {
        throw new Error(`${res.status} for osm-index.tsv`);
    }

    const lines = (await res.text()).split('\n');
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

        // Only the ones nothing claimed. The rest of the pool is every OSM stop near the feed
        // — 123,530 features on swiss-opendata against 68,571 stops — and drawing it would
        // bury the answer in the question.
        if (parseInt(c[at['gtfs_matched']], 10) !== 0) continue;

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
