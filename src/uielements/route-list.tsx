import { useEffect, useMemo, useState } from "preact/hooks";
import { DATA_BASE_URL } from "../config";
import { RoutesMap, type FullRouteDisplayEntry } from "./routes";
import { cls } from "./cls";

import "./route-list.css";

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
    inx: number;
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
            .then(text => {
                const entries = text.trim().split('\n').map(line => JSON.parse(line));
                if (import.meta.env.DEV) console.log(`Route index loaded: ${entries.length} routes for ${reportRegion}`);
                return entries;
            });
    }
    return routeIndexCache[reportRegion];
}

// Cache keyed by region+routeId — independent of which stop/selection triggered
// the fetch, so re-selecting a previously-seen route never hits the network again.
const routeVariantCache: { [key: string]: Promise<RouteVariant[]> } = {};

function getRouteVariants(reportRegion: string, entry: RouteIndexEntry): Promise<RouteVariant[]> {
    const key = `${reportRegion}:${entry.routeId}`;
    if (!routeVariantCache[key]) {
        routeVariantCache[key] = fetch(`${DATA_BASE_URL}/${reportRegion}/route-stops.ndjson`, {
            headers: { Range: `bytes=${entry.byteOffset}-${entry.byteOffset + entry.byteLength - 1}` },
        })
            .then(r => r.text())
            .then(text => {
                const variants = text.trim().split('\n').filter(l => l).map((l, i) => ({ ...JSON.parse(l), inx: i }));
                if (import.meta.env.DEV) {
                    console.log(`Variants loaded for ${entry.routeId}: ${variants.length} variant(s)`);
                    variants.forEach((v, i) => console.log(`  Variant #${i + 1}: ${v.gtfsIds.length} stops, ${v.latlon.length / 2} coordinates`));
                }
                return variants;
            });
    }
    return routeVariantCache[key];
}

type RoutePillProps = {
    route: RouteIndexEntry;
    variants: RouteVariant[];
    selectedRouteId: string | null;
    selectedVariantInx: number | null;
    onSelectRoute: (routeId: string) => void;
    onSelectVariant: (routeId: string, variantInx: number) => void;
};

function RoutePill({ route: r, variants, selectedRouteId, selectedVariantInx, onSelectRoute, onSelectVariant }: RoutePillProps) {
    const isSelected = selectedRouteId === r.routeId;
    return (
        <span
            onClick={() => onSelectRoute(r.routeId)}
            className={cls('route-pill', (!selectedRouteId || isSelected) && 'route-pill--selected')}>
            {r.shortName || r.routeId}
            {variants.length > 1 &&
                <span>
                    {' Variants: '}
                    {variants.map((v, i) =>
                        <span key={v.inx}
                            onClick={e => { e.stopPropagation(); onSelectVariant(r.routeId, v.inx); }}
                            className={cls('route-variant', selectedVariantInx === v.inx && isSelected && 'route-variant--selected')}>
                            {i > 0 && ' '}#{v.inx + 1}
                        </span>
                    )}
                </span>
            }
        </span>
    );
}

type RouteListProps = {
    reportRegion: string;
    routeIds: string[];
    routeTypes?: string;
    gtfsStopIds: string[];
};

export function RouteList({ reportRegion, routeIds, routeTypes, gtfsStopIds }: RouteListProps) {
    const [routeIndex, setRouteIndex] = useState<RouteIndexEntry[]>([]);
    const [routesWithVariants, setRoutesWithVariants] = useState<RouteWithVariants[]>([]);
    const [loading, setLoading] = useState(false);
    const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
    const [selectedVariantInx, setSelectedVariantInx] = useState<number | null>(null);

    // Stable string keys so the effect only re-runs when the actual selection
    // changes, not whenever the parent passes a new array reference.
    const routeIdsKey = routeIds.join(',');
    const gtfsStopIdsKey = gtfsStopIds.join(',');

    useEffect(() => {
        if (!reportRegion) return;

        let cancelled = false;

        getRouteIndex(reportRegion).then(index => {
            if (!cancelled) setRouteIndex(index);
        });

        return () => { cancelled = true; };
    }, [reportRegion]);

    const fullRouteEntries = useMemo<FullRouteDisplayEntry[]>(() => {
        const entries = routesWithVariants.flatMap(({ index: idx, variants }) => {
            if (selectedRouteId && idx.routeId !== selectedRouteId) return [];
            const relevantVariants = selectedRouteId && selectedVariantInx !== null
                ? variants.filter(v => v.inx === selectedVariantInx)
                : variants;
            return relevantVariants.map((v, i) => {
                const coordinates: [number, number][] = [];
                for (let j = 0; j < v.latlon.length; j += 2) {
                    coordinates.push([v.latlon[j + 1], v.latlon[j]]);
                }
                return {
                    routeKey: i === 0 ? idx.shortName || idx.routeId : `${idx.shortName || idx.routeId} #${i + 1}`,
                    coordinates
                };
            });
        });
        if (import.meta.env.DEV && entries.length > 0) {
            console.log('Full route entries (GeoJSON [lng, lat]):');
            entries.forEach(e => console.log(`  ${e.routeKey}: ${e.coordinates.length} coords, first: [${e.coordinates[0]}], last: [${e.coordinates[e.coordinates.length - 1]}]`));
        }
        return entries;
    }, [routesWithVariants, selectedRouteId, selectedVariantInx]);

    useEffect(() => {
        if (routeIndex.length === 0 || routeIds.length === 0) return;

        let cancelled = false;

        (async () => {
            setLoading(true);

            try {
                const entriesToFetch = routeIndex.filter(e => routeIds.includes(e.routeId));

                // Parallel + cached: repeat selections resolve from cache instantly,
                // new selections fan out concurrently instead of one-at-a-time.
                const results = await Promise.all(
                    entriesToFetch.map(async (entry): Promise<RouteWithVariants | null> => {
                        const allVariants = await getRouteVariants(reportRegion, entry);
                        const variants = allVariants.filter(v =>
                            v.gtfsIds.some(id => gtfsStopIds.includes(id)));
                        return variants.length > 0 ? { index: entry, variants } : null;
                    })
                );

                if (!cancelled) {
                    const matched = results.filter((r): r is RouteWithVariants => r !== null);
                    setRoutesWithVariants(matched);
                    setSelectedRouteId(prev => matched.some(r => r.index.routeId === prev) ? prev : null);
                    setSelectedVariantInx(null);
                }
            } catch (e) {
                console.error('Failed to load routes', e);
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();

        return () => { cancelled = true; };
    }, [routeIndex, routeIdsKey, gtfsStopIdsKey, reportRegion]);

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
                {routesWithVariants.map(({ index: r, variants }) =>
                    <RoutePill key={r.routeId}
                        route={r}
                        variants={variants}
                        selectedRouteId={selectedRouteId}
                        selectedVariantInx={selectedVariantInx}
                        onSelectRoute={routeId => {
                            setSelectedRouteId(prev => prev === routeId ? null : routeId);
                            setSelectedVariantInx(null);
                        }}
                        onSelectVariant={(routeId, variantInx) => {
                            if (selectedRouteId === routeId && selectedVariantInx === variantInx) {
                                setSelectedVariantInx(null);
                            } else {
                                setSelectedRouteId(routeId);
                                setSelectedVariantInx(variantInx);
                            }
                        }} />
                )}
            </div>}
        </div>
    );
}
