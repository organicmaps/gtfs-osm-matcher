import { useEffect, useState } from "preact/hooks";
import { getRouteIndex, type RouteIndexEntry } from "./route-list";
import { getRouteVariants, type RouteVariant } from "../services/routeVariants";
import { osmFeatureUrl } from "../services/OSMData";
import { cls } from "./cls";

import "./route-list.css";
import "./routes-tab.css";

type RoutesTabProps = {
    reportRegion: string;
};

export function RoutesTab({ reportRegion }: RoutesTabProps) {
    const [index, setIndex] = useState<RouteIndexEntry[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [filter, setFilter] = useState<'all' | 'matched' | 'unmatched'>('all');
    const [search, setSearch] = useState('');
    const [expandedRoute, setExpandedRoute] = useState<string | null>(null);
    const [variantsByRoute, setVariantsByRoute] = useState<Record<string, RouteVariant[]>>({});
    const [variantLoading, setVariantLoading] = useState<string | null>(null);

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

    const filtered = index.filter(r => {
        if (filter === 'matched' && r.matchStatus !== 'matched') return false;
        if (filter === 'unmatched' && r.matchStatus !== 'unmatched') return false;
        if (search) {
            const q = search.toLowerCase();
            return (r.shortName?.toLowerCase().includes(q) ||
                r.longName?.toLowerCase().includes(q) ||
                r.routeId?.toLowerCase().includes(q));
        }
        return true;
    });

    const matchedCount = index.filter(r => r.matchStatus === 'matched').length;
    const unmatchedCount = index.filter(r => r.matchStatus === 'unmatched').length;
    const noDataCount = index.length - matchedCount - unmatchedCount;

    const expandRoute = (routeId: string) => {
        if (expandedRoute === routeId) {
            setExpandedRoute(null);
            return;
        }
        setExpandedRoute(routeId);
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

    if (loading) return <div className="routes-tab">Loading routes…</div>;
    if (error) return <div className="routes-tab">Error: {error}</div>;
    if (index.length === 0) return <div className="routes-tab">No routes in this report.</div>;

    return (
        <div className="routes-tab">
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

            <div className="routes-tab-list">
                {filtered.map(r => (
                    <div key={r.routeId} className="routes-tab-row">
                        <div className="routes-tab-route-header" onClick={() => expandRoute(r.routeId)}>
                            <span className="routes-tab-expand">
                                {expandedRoute === r.routeId ? '▼' : '▶'}
                            </span>
                            <span className="route-pill">
                                {r.shortName || r.routeId}
                            </span>
                            {r.longName && <span className="routes-tab-long-name">{r.longName}</span>}
                            {r.matchStatus && (
                                <span className={cls('route-match-badge',
                                    `route-match-badge--${r.matchStatus}`)}>
                                    {r.matchStatus === 'matched' ? '✓' : '✗'}
                                </span>
                            )}
                            <span className="routes-tab-route-type">{r.routeType}</span>
                        </div>
                        {expandedRoute === r.routeId && (
                            <div className="routes-tab-variants">
                                {variantLoading === r.routeId && <div>Loading variants…</div>}
                                {(variantsByRoute[r.routeId] || []).map((v, i) => (
                                    <div key={i} className="routes-tab-variant">
                                        <span>
                                            #{i + 1}
                                            {v.dir != null ? ` ${v.dir === 0 ? '\u2191' : '\u2193'}` : ''}
                                        </span>
                                        <span>{v.gtfsIds.length} stops</span>
                                        {v.osm != null && (
                                            <a href={osmFeatureUrl(`r${v.osm}`)} target="_blank" rel="noopener"
                                                className="route-osm-link">
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