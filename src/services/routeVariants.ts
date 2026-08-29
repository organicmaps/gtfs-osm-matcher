import { DATA_BASE_URL } from "../config";
import { memoFetch } from "./memoFetch";

/** One drawn shape of a route: a flat lat,lon,lat,lon… array and the stops it serves. */
export type RouteVariant = {
    route: number;
    latlon: number[];
    gtfsIds: string[];
    dir?: number;
    inx: number;
};

// Cache keyed by region+routeId — independent of which stop, panel or selection triggered
// the fetch, so re-selecting a previously-seen route never hits the network again. One
// cache for both callers: the route list and the preview panel read the same byte ranges
// of the same file, and two caches fetched the same route twice.
const routeVariantCache: { [key: string]: Promise<RouteVariant[]> } = {};

/**
 * The variants of one route, from the byte range whichever index named it — `routes.ndjson`
 * for the route list, a stop's own route line for the preview. They differ only in the
 * field names holding the offset and the length.
 *
 * A failed range request is evicted rather than cached: the caller can retry, instead of
 * the panel being pinned at "loading" for the rest of the session.
 */
export function getRouteVariants(
    reportRegion: string, routeId: string, byteOffset: number, byteLength: number,
): Promise<RouteVariant[]> {
    const key = `${reportRegion}:${routeId}`;
    return memoFetch(routeVariantCache, key, () =>
        fetch(`${DATA_BASE_URL}/${reportRegion}/route-stops.ndjson`, {
            headers: { Range: `bytes=${byteOffset}-${byteOffset + byteLength - 1}` },
        })
            .then(r => {
                if (!r.ok) throw new Error(`${r.status} for route-stops.ndjson ${byteOffset}+${byteLength}`);
                return r.text();
            })
            .then(text => {
                const variants: RouteVariant[] = text.trim().split('\n').filter(l => l).map(l => JSON.parse(l));
                variants.sort((a, b) => {
                    const dirCmp = (a.dir ?? -1) - (b.dir ?? -1);
                    if (dirCmp !== 0) return dirCmp;
                    return b.gtfsIds.length - a.gtfsIds.length;
                });
                variants.forEach((v, i) => { v.inx = i; });
                return variants;
            })
    );
}
