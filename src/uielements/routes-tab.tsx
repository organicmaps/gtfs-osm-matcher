import { useContext, useEffect, useMemo, useState } from "preact/hooks";
import { getRouteIndex, type RouteIndexEntry } from "./route-list";
import { getRouteVariants, type RouteVariant } from "../services/routeVariants";
import { getOsmRouteGeometry } from "../services/osmRouteGeometry";
import { RoutesMap, type FullRouteDisplayEntry } from "./routes";
import { MapContext } from "../app";
import { parseSelectionHash, useHashRoute } from "./routing";
import { cls } from "./cls";
import { RouteInfo } from "./route-info";
import { RouteListItem } from "./route-list-item";

import "./route-list.css";
import "./routes-tab.css";

type MatchFilter = 'all' | 'matched' | 'partial' | 'unmatched';

type RoutesTabProps = {
    reportRegion: string;
    active: boolean;
};

export function RoutesTab({ reportRegion, active }: RoutesTabProps) {
    const map = useContext(MapContext)?.map;
    const [index, setIndex] = useState<RouteIndexEntry[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [relationFilter, setRelationFilter] = useState<MatchFilter>('all');
    const [stopFilter, setStopFilter] = useState<MatchFilter>('all');
    const [search, setSearch] = useState('');
    const [selectedModes, setSelectedModes] = useState<Set<string>>(new Set());
    const [expandedRoute, setExpandedRoute] = useState<string | null>(null);
    const [selectedVariantInx, setSelectedVariantInx] = useState<number | null>(null);
    const [variantsByRoute, setVariantsByRoute] = useState<Record<string, RouteVariant[]>>({});
    const [variantLoading, setVariantLoading] = useState<string | null>(null);
    const [osmGeometry, setOsmGeometry] = useState<{ relationId: number; lines: [number, number][][] } | null>(null);
    const [osmLoadingId, setOsmLoadingId] = useState<number | null>(null);
    const [osmError, setOsmError] = useState<{ relationId: number; message: string } | null>(null);
    const [osmRetry, setOsmRetry] = useState(0);

    // A region switch changes which modes are even present — reset the filter so a
    // stale one does not silently hide everything.
    useEffect(() => setSelectedModes(new Set()), [reportRegion]);

    useEffect(() => {
        if (!reportRegion) return;
        let cancelled = false;
        setLoading(true);
        setError(null);
        getRouteIndex(reportRegion)
            .then(idx => {
                if (!cancelled) {
                    setIndex(idx);
                    setLoading(false);
                }
            })
            .catch(e => {
                if (!cancelled) {
                    setError(String(e));
                    setLoading(false);
                }
            });
        return () => { cancelled = true; };
    }, [reportRegion]);

    const hasRelationMatchData = index.some(r => r.relationMatch);
    const hasStopMatchData = index.some(r => r.stopMatch);

    useEffect(() => {
        setRelationFilter('all');
        setStopFilter('all');
    }, [reportRegion]);

    // Modes present in this region, with counts; ordered by frequency so the common
    // ones (Bus, almost always) stay in view when the row wraps.
    const modes = useMemo(() => {
        const counts = new Map<string, number>();
        for (const r of index) {
            const m = r.routeType || 'Unknown';
            counts.set(m, (counts.get(m) || 0) + 1);
        }
        return [...counts.entries()].sort((a, b) => b[1] - a[1]);
    }, [index]);

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        const matching = index.filter(r => {
            if (relationFilter !== 'all') {
                const relationStatus = r.relationMatch?.status;
                if (relationStatus !== relationFilter) return false;
            }
            if (stopFilter !== 'all' && (r.stopMatch?.status || 'unknown') !== stopFilter) return false;
            if (selectedModes.size > 0 && !selectedModes.has(r.routeType || 'Unknown')) return false;
            if (!q) return true;
            return (r.shortName?.toLowerCase().includes(q) ||
                r.longName?.toLowerCase().includes(q) ||
                r.routeId?.toLowerCase().includes(q));
        });

        if (!q) return matching;

        // Rank so a whole-word match on the short name leads — searching "7" puts the
        // route named "7" ahead of "137", and named variants "7A"/"7B" ahead of
        // "137" via the prefix tier. Stable sort keeps index order within a tier.
        const rank = (e: RouteIndexEntry): number => {
            const sh = (e.shortName || '').toLowerCase();
            const ln = (e.longName || '').toLowerCase();
            const rid = (e.routeId || '').toLowerCase();
            if (sh === q) return 0;
            if (sh && sh.startsWith(q)) return 1;
            if (sh.includes(q)) return 2;
            if (ln && ln.startsWith(q)) return 3;
            if (rid.startsWith(q)) return 4;
            if (ln.includes(q)) return 5;
            if (rid.includes(q)) return 6;
            return 7;
        };

        return [...matching].sort((a, b) => rank(a) - rank(b));
    }, [index, relationFilter, stopFilter, search, selectedModes]);

    const statusCounts = (key: 'relationMatch' | 'stopMatch') => ({
        matched: index.filter(r => r[key]?.status === 'matched').length,
        partial: index.filter(r => r[key]?.status === 'partial').length,
        unmatched: index.filter(r => r[key]?.status === 'unmatched').length,
        unknown: index.filter(r => !r[key]).length,
    });
    const relationCounts = statusCounts('relationMatch');
    const stopCounts = statusCounts('stopMatch');

    const selectedVariant = selectedVariantInx === null ? undefined :
        (variantsByRoute[expandedRoute || ''] || []).find(v => v.inx === selectedVariantInx);
    const selectedOsmRelationId = selectedVariant?.osm;

    useEffect(() => {
        if (!active || selectedOsmRelationId == null) {
            setOsmLoadingId(null);
            return;
        }
        let cancelled = false;
        setOsmLoadingId(selectedOsmRelationId);
        setOsmError(null);
        getOsmRouteGeometry(selectedOsmRelationId)
            .then(lines => {
                if (!cancelled) {
                    setOsmGeometry({ relationId: selectedOsmRelationId, lines });
                    setOsmLoadingId(null);
                }
            })
            .catch(e => {
                if (!cancelled) {
                    setOsmError({ relationId: selectedOsmRelationId, message: String(e) });
                    setOsmLoadingId(null);
                }
            });
        return () => { cancelled = true; };
    }, [active, selectedOsmRelationId, osmRetry]);

    const mapEntries = useMemo<FullRouteDisplayEntry[]>(() => {
        if (!expandedRoute) return [];
        const route = index.find(r => r.routeId === expandedRoute);
        const variants = variantsByRoute[expandedRoute] || [];
        const shown = selectedVariantInx === null ? variants :
            variants.filter(v => v.inx === selectedVariantInx);
        const gtfs = shown.filter(v => v.latlon.length >= 4).map(v => {
            const coordinates: [number, number][] = [];
            for (let i = 0; i < v.latlon.length; i += 2) {
                coordinates.push([v.latlon[i + 1], v.latlon[i]]);
            }
            return { routeKey: `${route?.shortName || expandedRoute} #${v.inx + 1}`, coordinates };
        });
        const osm = selectedOsmRelationId != null && osmGeometry?.relationId === selectedOsmRelationId
            ? osmGeometry.lines.map(coordinates => ({
                routeKey: `OSM r${selectedOsmRelationId}`, coordinates, kind: 'osm' as const,
            })) : [];
        return [...gtfs, ...osm];
    }, [expandedRoute, index, variantsByRoute, selectedVariantInx, selectedOsmRelationId, osmGeometry]);

    const expandedRouteEntry = index.find(r => r.routeId === expandedRoute);

    const expandRoute = (routeId: string) => {
        if (expandedRoute === routeId) {
            if (selectedVariantInx !== null) {
                setSelectedVariantInx(null);
                return;
            }
            setExpandedRoute(null);
            return;
        }
        setExpandedRoute(routeId);
        setSelectedVariantInx(null);
        if (variantsByRoute[routeId]) return;
        const entry = index.find(r => r.routeId === routeId);
        if (!entry) return;
        setVariantLoading(routeId);
        getRouteVariants(reportRegion, routeId, entry.byteOffset, entry.byteLength)
            .then(variants => {
                setVariantsByRoute(prev => ({ ...prev, [routeId]: variants }));
                setVariantLoading(null);
            })
            .catch(e => {
                console.error('Failed to load variants for', routeId, e);
                setVariantLoading(null);
            });
    };

    // Fly the map to fit all of a route's drawn geometry. Fetches the variants
    // through the shared memo cache independently of whether the row is expanded,
    // so the button works on a collapsed row too — and also expands the row so the
    // route is actually drawn alongside the camera move.
    const flyToRoute = (routeId: string) => {
        if (!map) return;
        const entry = index.find(r => r.routeId === routeId);
        if (!entry) return;
        if (expandedRoute !== routeId) {
            setExpandedRoute(routeId);
            setSelectedVariantInx(null);
            if (!variantsByRoute[routeId]) setVariantLoading(routeId);
        }
        const cached = variantsByRoute[routeId];
        const variantsPromise = cached
            ? Promise.resolve(cached)
            : getRouteVariants(reportRegion, routeId, entry.byteOffset, entry.byteLength);
        variantsPromise
            .then(variants => {
                if (!variantsByRoute[routeId]) {
                    setVariantsByRoute(prev => ({ ...prev, [routeId]: variants }));
                    setVariantLoading(null);
                }
                let minLon = Infinity, maxLon = -Infinity, minLat = Infinity, maxLat = -Infinity;
                let n = 0;
                for (const v of variants) {
                    const ll = v.latlon;
                    for (let i = 0; i + 1 < ll.length; i += 2) {
                        const lon = ll[i + 1], lat = ll[i];
                        if (lon < minLon) minLon = lon;
                        if (lon > maxLon) maxLon = lon;
                        if (lat < minLat) minLat = lat;
                        if (lat > maxLat) maxLat = lat;
                        n++;
                    }
                }
                if (n === 0 || !isFinite(minLon)) return;
                map.fitBounds([[minLon, minLat], [maxLon, maxLat]], { padding: 60 });
            })
            .catch(e => {
                console.error('flyToRoute failed for', routeId, e);
                setVariantLoading(null);
            });
    };

    // Route deep-link (`#/match-report/{region}/selection/route/{id}`): expand + fly to
    // the named route. App already switched the tab to 'routes'; this does the rest.
    // Waits for the index to load so the route's byte range is known before fetching
    // variants. A repeated identical hash does not refire, so a manual collapse/expand
    // here is not fought.
    const hashSelection = useHashRoute(parseSelectionHash);
    useEffect(() => {
        if (!active || hashSelection?.kind !== 'route' || index.length === 0) return;
        const routeId = hashSelection.id;
        if (expandedRoute === routeId) return;
        if (!index.some(r => r.routeId === routeId)) return;
        flyToRoute(routeId);
    }, [active, hashSelection?.kind, hashSelection?.id, index.length]);

    if (loading) return <div className="routes-tab">Loading routes…</div>;
    if (error) return <div className="routes-tab">Error: {error}</div>;
    if (index.length === 0) return <div className="routes-tab">No routes in this report.</div>;

    return (
        <div className="routes-tab">
            {active && mapEntries.length > 0 && <RoutesMap fullRoutes={mapEntries} />}
            <div className="routes-tab-stats">
                {hasRelationMatchData && <div>
                    Routes by relation coverage: {relationCounts.matched} complete · {relationCounts.partial} partial · {relationCounts.unmatched} none
                    {relationCounts.unknown > 0 && ` · ${relationCounts.unknown} no data`}
                </div>}
                {hasStopMatchData && <div>
                    Routes by stop coverage: {stopCounts.matched} complete · {stopCounts.partial} partial · {stopCounts.unmatched} none
                    {stopCounts.unknown > 0 && ` · ${stopCounts.unknown} no data`}
                </div>}
                <div>{index.length} routes</div>
            </div>

            {expandedRoute && <div className="routes-tab-map-status">
                <span className="routes-tab-legend-gtfs">&nbsp;&nbsp;&mdash;&nbsp;GTFS</span>
                {selectedOsmRelationId != null && <>
                    <span className="routes-tab-legend-osm">&nbsp;&nbsp;&mdash;&nbsp;OSM r{selectedOsmRelationId}</span>
                    {osmLoadingId === selectedOsmRelationId && ' (loading…)'}
                    {osmGeometry?.relationId === selectedOsmRelationId && osmGeometry.lines.length === 0 &&
                        ' (no drawable ways)'}
                    {osmError?.relationId === selectedOsmRelationId &&
                        <>
                            <span className="routes-tab-map-error"> — {osmError.message}</span>{' '}
                            <button type="button" onClick={() => setOsmRetry(retry => retry + 1)}
                                disabled={osmLoadingId === selectedOsmRelationId}>Retry</button>
                        </>}
                </>}
            </div>}

            {expandedRouteEntry && <RouteInfo route={expandedRouteEntry}
                variants={variantsByRoute[expandedRouteEntry.routeId] || []}
                selectedVariant={selectedVariant} />}

            <div className="routes-tab-filters">
                {hasRelationMatchData && <label className="routes-tab-filter">
                    Relations <select value={relationFilter} onChange={e => setRelationFilter((e.target as HTMLSelectElement).value as MatchFilter)}>
                        <option value="all">All routes</option>
                        <option value="matched">All variants are paired</option>
                        <option value="partial">Some variants are paired</option>
                        <option value="unmatched">No variants are paired</option>
                    </select>
                </label>}
                {hasStopMatchData && <label className="routes-tab-filter">
                    Stops <select value={stopFilter} onChange={e => setStopFilter((e.target as HTMLSelectElement).value as MatchFilter)}>
                        <option value="all">All routes</option>
                        <option value="matched">All stops are matched</option>
                        <option value="partial">Some stops are matched</option>
                        <option value="unmatched">No stops are matched</option>
                    </select>
                </label>}
                {(hasRelationMatchData || hasStopMatchData) &&
                    <span className="routes-tab-filter">{filtered.length} shown</span>}
                <input type="text" placeholder="Search routes…"
                    value={search}
                    onInput={e => setSearch((e.target as HTMLInputElement).value)}
                    className="routes-tab-search" />
            </div>

            {modes.length > 1 && (
                <div className="routes-tab-modes">
                    {modes.map(([mode, count]) => (
                        <button key={mode} type="button"
                            className={cls('routes-tab-mode', selectedModes.has(mode) && 'routes-tab-mode--active')}
                            onClick={() => setSelectedModes(prev => {
                                const next = new Set(prev);
                                if (next.has(mode)) next.delete(mode);
                                else next.add(mode);
                                return next;
                            })}
                            title={`${selectedModes.has(mode) ? 'Hide' : 'Show'} ${count} ${mode} ${count === 1 ? 'route' : 'routes'}`}>
                            {mode}{' '}<span className="routes-tab-mode-count">{count}</span>
                        </button>
                    ))}
                    {selectedModes.size > 0 && (
                        <button type="button" className="routes-tab-mode-clear"
                            onClick={() => setSelectedModes(new Set())}>Clear</button>
                    )}
                </div>
            )}

            <div className="routes-tab-list">
                {filtered.map(r => (
                    <RouteListItem key={r.routeId} route={r}
                        expanded={expandedRoute === r.routeId}
                        variants={variantsByRoute[r.routeId] || []}
                        variantLoading={variantLoading === r.routeId}
                        selectedVariantInx={selectedVariantInx}
                        onExpand={() => expandRoute(r.routeId)}
                        onSelectVariant={variantInx => setSelectedVariantInx(prev =>
                            prev === variantInx ? null : variantInx)}
                        onFlyTo={() => flyToRoute(r.routeId)} />
                ))}
            </div>
        </div>
    );
}
