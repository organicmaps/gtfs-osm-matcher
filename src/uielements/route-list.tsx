import { useEffect, useMemo, useState } from "preact/hooks";
import { DATA_BASE_URL } from "../config";
import { RoutesMap, type FullRouteDisplayEntry } from "./routes";

type RouteIndexEntry = {
    routeId: string;
    shortName: string;
    longName: string;
    routeType: string;
    typeRaw: string;
    agency: string;
    byteOffset: number;
    byteLength: number;
};

type RouteVariant = {
    route: number;
    latlon: number[];
    gtfsIds: string[];
};

type RouteWithVariants = {
    index: RouteIndexEntry;
    variants: RouteVariant[];
};

const routeIndexCache: { [region: string]: Promise<RouteIndexEntry[]> } = {};

function getRouteIndex(reportRegion: string): Promise<RouteIndexEntry[]> {
    if (!routeIndexCache[reportRegion]) {
        routeIndexCache[reportRegion] = fetch(`${DATA_BASE_URL}/${reportRegion}/routes.ndjson`)
            .then(r => r.text())
            .then(text => text.trim().split('\n').map(line => JSON.parse(line)));
    }
    return routeIndexCache[reportRegion];
}

type RouteListProps = {
    reportRegion: string;
    routeIds: { [routeId: string]: any };
    routeTypes?: string;
    gtfsStopIds: string[];
};

export function RouteList({ reportRegion, routeIds, routeTypes, gtfsStopIds }: RouteListProps) {
    const routeIdList = useMemo(() => Object.keys(routeIds || {}), [routeIds]);
    const stopIdSet = useMemo(() => new Set(gtfsStopIds), [gtfsStopIds]);

    const [routeIndex, setRouteIndex] = useState<RouteIndexEntry[]>([]);
    const [routesWithVariants, setRoutesWithVariants] = useState<RouteWithVariants[]>([]);
    const [loading, setLoading] = useState(false);

    const fullRouteEntries = useMemo<FullRouteDisplayEntry[]>(() => {
        return routesWithVariants.flatMap(({ index: idx, variants }) =>
            variants.map((v, i) => {
                const coordinates: [number, number][] = [];
                for (let j = 0; j < v.latlon.length; j += 2) {
                    coordinates.push([v.latlon[j + 1], v.latlon[j]]);
                }
                return {
                    routeKey: i === 0 ? idx.shortName || idx.routeId : `${idx.shortName || idx.routeId} #${i + 1}`,
                    coordinates
                };
            })
        );
    }, [routesWithVariants]);

    useEffect(() => {
        if (!reportRegion || routeIdList.length === 0) return;

        let cancelled = false;

        (async () => {
            setLoading(true);

            try {
                const index = await getRouteIndex(reportRegion);
                if (cancelled) return;
                setRouteIndex(index);

                const routeIdSet = new Set(routeIdList);
                const matched: RouteWithVariants[] = [];

                const entriesToFetch = index.filter(e => routeIdSet.has(e.routeId));

                for (const entry of entriesToFetch) {
                    if (cancelled) break;

                    const variantRes = await fetch(`${DATA_BASE_URL}/${reportRegion}/route-stops.ndjson`, {
                        headers: { Range: `bytes=${entry.byteOffset}-${entry.byteOffset + entry.byteLength - 1}` },
                    });

                    const variantText = await variantRes.text();
                    const variantLines = variantText.trim().split('\n');

                    const allVariants: RouteVariant[] = variantLines
                        .filter(l => l)
                        .map(l => JSON.parse(l));

                    const variants = allVariants.filter(v =>
                        v.gtfsIds.some(id => stopIdSet.has(id)));

                    if (variants.length > 0) {
                        matched.push({ index: entry, variants });
                    }
                }

                if (!cancelled) {
                    setRoutesWithVariants(matched);
                    console.log('Routes for stop', routeIdList, matched);
                }
            } catch (e) {
                console.error('Failed to load routes', e);
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();

        return () => { cancelled = true; };
    }, [reportRegion, routeIdList]);

    if (loading) {
        return <div>Loading routes...</div>;
    }

    if (routesWithVariants.length === 0 && !routeTypes) {
        return null;
    }

    return (
        <div>
            <RoutesMap fullRoutes={fullRouteEntries} />
            {(routeTypes?.length || 0) > 0 &&
                <div>Gtfs route types: <b>{routeTypes}</b></div>
            }
            {routesWithVariants.length > 0 && <div><b>Routes: </b>
                {routesWithVariants.map(({ index: r }) =>
                    <span key={r.routeId}>{r.shortName || r.routeId} </span>
                )}
            </div>}
        </div>
    );
}