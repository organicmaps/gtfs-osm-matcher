import { useContext, useEffect, useMemo, useState } from "preact/hooks";
import { getRouteIndex, type RouteIndexEntry } from "./route-list";
import { getRouteVariants, type RouteVariant } from "../services/routeVariants";
import { getOsmRouteGeometry } from "../services/osmRouteGeometry";
import { osmFeatureUrl } from "../services/OSMData";
import { RoutesMap, type FullRouteDisplayEntry } from "./routes";
import { MapContext } from "../app";
import { parseSelectionHash, useHashRoute } from "./routing";
import { cls } from "./cls";

import "./route-list.css";
import "./routes-tab.css";

type RoutesTabProps = {
    reportRegion: string;
    active: boolean;
};

export function RoutesTab({ reportRegion, active }: RoutesTabProps) {
    const map = useContext(MapContext)?.map;
    const [index, setIndex] = useState<RouteIndexEntry[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [filter, setFilter] = useState<'all' | 'matched' | 'unmatched'>('all');
    const [search, setSearch] = useState('');
    const [selectedModes, setSelectedModes] = useState<Set<string>>(new Set());
    const [expandedRoute, setExpandedRoute] = useState<string | null>(null);
    const [selectedVariantInx, setSelectedVariantInx] = useState<number | null>(null);
    const [variantsByRoute, setVariantsByRoute] = useState<Record<string, RouteVariant[]>>({});
    const [variantLoading, setVariantLoading] = useState<string | null>(null);
    const [osmGeometry, setOsmGeometry] = useState<{ relationId: number; lines: [number, number][][] } | null>(null);
    const [osmLoadingId, setOsmLoadingId] = useState<number | null>(null);
    const [osmError, setOsmError] = useState<{ relationId: number; message: string } | null>(null);

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

    const hasMatchData = index.some(r => r.matchStatus);

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
            if (filter === 'matched' && r.matchStatus !== 'matched') return false;
            if (filter === 'unmatched' && r.matchStatus !== 'unmatched') return false;
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
    }, [index, filter, search, selectedModes]);

    const matchedCount = index.filter(r => r.matchStatus === 'matched').length;
    const unmatchedCount = index.filter(r => r.matchStatus === 'unmatched').length;
    const noDataCount = index.length - matchedCount - unmatchedCount;

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
    }, [active, selectedOsmRelationId]);

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

    // Derived info for the expanded-route panel: distinct OSM relations matched across
    // variants, and the total stop count. Empty until the variants have loaded.
    const expandedInfo = useMemo(() => {
        if (!expandedRoute) return null;
        const route = index.find(r => r.routeId === expandedRoute);
        if (!route) return null;
        const variants = variantsByRoute[expandedRoute] || [];
        const osmRels = new Set<number>();
        let stops = 0;
        for (const v of variants) {
            if (v.osm != null) osmRels.add(v.osm);
            stops += v.gtfsIds.length;
        }
        return { route, variants: variants.length, stops, osmRels: [...osmRels] };
    }, [expandedRoute, index, variantsByRoute]);

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
                {hasMatchData ? (
                    <span>
                        <span className="route-match-badge route-match-badge--matched">✓ {matchedCount}</span>
                        {' '}
                        <span className="route-match-badge route-match-badge--unmatched">✗ {unmatchedCount}</span>
                        {noDataCount > 0 && <span> — {noDataCount} no data</span>}
                        {' \u2014 '}
                        {index.length} total
                    </span>
                ) : (
                    <span>{index.length} routes</span>
                )}
            </div>

            {expandedRoute && <div className="routes-tab-map-status">
                <span className="routes-tab-legend-gtfs">&nbsp;&nbsp;&mdash;&nbsp;GTFS</span>
                {selectedOsmRelationId != null && <>
                    <span className="routes-tab-legend-osm">&nbsp;&nbsp;&mdash;&nbsp;OSM r{selectedOsmRelationId}</span>
                    {osmLoadingId === selectedOsmRelationId && ' (loading…)'}
                    {osmGeometry?.relationId === selectedOsmRelationId && osmGeometry.lines.length === 0 &&
                        ' (no drawable ways)'}
                    {osmError?.relationId === selectedOsmRelationId &&
                        <span className="routes-tab-map-error"> — {osmError.message}</span>}
                </>}
            </div>}

            {expandedInfo && (
                <div className="routes-tab-info">
                    <div className="routes-tab-info-grid">
                        <div className="routes-tab-info-item">
                            <span className="routes-tab-info-label">GTFS ID</span>
                            <span className="routes-tab-info-value">{expandedInfo.route.routeId}</span>
                        </div>
                        <div className="routes-tab-info-item">
                            <span className="routes-tab-info-label">Short name</span>
                            <span className="routes-tab-info-value">{expandedInfo.route.shortName || '\u2014'}</span>
                        </div>
                        <div className="routes-tab-info-item">
                            <span className="routes-tab-info-label">Type</span>
                            <span className="routes-tab-info-value">
                                {expandedInfo.route.routeType || '\u2014'}
                                {expandedInfo.route.typeRaw && <span className="routes-tab-info-sub"> ({expandedInfo.route.typeRaw})</span>}
                            </span>
                        </div>
                        {expandedInfo.route.agency && (
                            <div className="routes-tab-info-item">
                                <span className="routes-tab-info-label">Agency</span>
                                <span className="routes-tab-info-value">{expandedInfo.route.agency}</span>
                            </div>
                        )}
                        {expandedInfo.route.matchStatus && (
                            <div className="routes-tab-info-item">
                                <span className="routes-tab-info-label">Match</span>
                                <span className="routes-tab-info-value">
                                    <span className={cls('route-match-dot',
                                        `route-match-dot--${expandedInfo.route.matchStatus}`)} />
                                    {expandedInfo.route.matchStatus}
                                </span>
                            </div>
                        )}
                        {expandedInfo.route.modeIgnored != null && (
                            <div className="routes-tab-info-item">
                                <span className="routes-tab-info-label">Mode ignored</span>
                                <span className="routes-tab-info-value">{expandedInfo.route.modeIgnored ? 'yes' : 'no'}</span>
                            </div>
                        )}
                        {expandedInfo.route.color && (
                            <div className="routes-tab-info-item">
                                <span className="routes-tab-info-label">Color</span>
                                <span className="routes-tab-info-value">
                                    <span className="routes-tab-info-swatch"
                                        style={{ background: `#${expandedInfo.route.color}` }}
                                        title={`#${expandedInfo.route.color}`} />
                                    {expandedInfo.route.color}
                                </span>
                            </div>
                        )}
                        <div className="routes-tab-info-item">
                            <span className="routes-tab-info-label">Variants</span>
                            <span className="routes-tab-info-value">{expandedInfo.variants || '\u2026'}</span>
                        </div>
                        {expandedInfo.variants > 0 && (
                            <div className="routes-tab-info-item">
                                <span className="routes-tab-info-label">Stops</span>
                                <span className="routes-tab-info-value">{expandedInfo.stops}</span>
                            </div>
                        )}
                        {expandedInfo.osmRels.length > 0 && (
                            <div className="routes-tab-info-item">
                                <span className="routes-tab-info-label">OSM rel</span>
                                <span className="routes-tab-info-value">
                                    {expandedInfo.osmRels.map((id, i) => (
                                        <span key={id}>
                                            {i > 0 && ', '}
                                            <a href={osmFeatureUrl(`r${id}`)} target="_blank" rel="noopener"
                                                className="route-osm-link">r{id}</a>
                                        </span>
                                    ))}
                                </span>
                            </div>
                        )}
                    </div>
                    {expandedInfo.route.longName && (
                        <div className="routes-tab-info-longname">{expandedInfo.route.longName}</div>
                    )}
                </div>
            )}

            <div className="routes-tab-filters">
                {hasMatchData && <>
                    <label className="routes-tab-filter">
                        <input type="radio" checked={filter === 'all'}
                            onChange={() => setFilter('all')} /> All
                    </label>
                    <label className="routes-tab-filter">
                        <input type="radio" checked={filter === 'matched'}
                            onChange={() => setFilter('matched')} /> Matched
                    </label>
                    <label className="routes-tab-filter">
                        <input type="radio" checked={filter === 'unmatched'}
                            onChange={() => setFilter('unmatched')} /> Unmatched
                    </label>
                    {' | '}
                </>}
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
                    <div key={r.routeId} className="routes-tab-row">
                        <div className={cls('routes-tab-route-header', expandedRoute === r.routeId && 'routes-tab-route-header--selected')}
                            onClick={() => expandRoute(r.routeId)}>
                            <span className="routes-tab-expand">
                                {expandedRoute === r.routeId ? '▼' : '▶'}
                            </span>
                            <span className="routes-tab-route-name">
                                {r.shortName}
                            </span>
                            <span style={{fontSize: '0.75em'}}>({r.routeId})</span>
                            {r.longName && <span className="routes-tab-long-name">{r.longName}</span>}
                            {r.matchStatus && (
                                <span className={cls('route-match-dot',
                                    `route-match-dot--${r.matchStatus}`)}
                                    title={r.matchStatus === 'matched' ? 'Matched to an OSM relation' : 'No OSM relation matched'}
                                    aria-label={r.matchStatus === 'matched' ? 'Matched' : 'Unmatched'} />
                            )}
                            <span className="routes-tab-route-type">{r.routeType}</span>
                            <button type="button" className="routes-tab-flyto"
                                title="Fly to route on map"
                                onClick={e => { e.stopPropagation(); flyToRoute(r.routeId); }}>
                                {'\u21D8'}
                            </button>
                        </div>
                        {expandedRoute === r.routeId && (
                            <div className="routes-tab-variants">
                                {variantLoading === r.routeId && <div>Loading variants…</div>}
                                {(variantsByRoute[r.routeId] || []).map((v, i) => (
                                    <div key={v.inx}
                                        className={cls('routes-tab-variant', selectedVariantInx === v.inx && 'routes-tab-variant--selected')}
                                        onClick={() => setSelectedVariantInx(prev => prev === v.inx ? null : v.inx)}>
                                        <span>
                                            #{i + 1}
                                            {v.dir != null ? ` ${v.dir === 0 ? '\u2191' : '\u2193'}` : ''}
                                        </span>
                                        <span>{v.gtfsIds.length} stops</span>
                                        {v.osm != null && (
                                            <a href={osmFeatureUrl(`r${v.osm}`)} target="_blank" rel="noopener"
                                                className="route-osm-link" onClick={e => e.stopPropagation()}>
                                                ↗ r{v.osm}
                                            </a>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}
