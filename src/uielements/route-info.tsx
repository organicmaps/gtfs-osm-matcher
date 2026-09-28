import type { RouteVariant } from "../services/routeVariants";
import { osmFeatureUrl } from "../services/OSMData";
import type { RouteIndexEntry } from "./route-list";
import { RouteMatchStatus } from "./route-match-status";

type RouteInfoProps = {
    route: RouteIndexEntry;
    variants: RouteVariant[];
    selectedVariant?: RouteVariant;
};

export function RouteInfo({ route, variants, selectedVariant }: RouteInfoProps) {
    const osmRels = new Set<number>();
    let stops = 0;
    for (const variant of variants) {
        if (variant.osm != null) osmRels.add(variant.osm);
        stops += variant.gtfsIds.length;
    }
    const matchedStopIds = selectedVariant?.osmStopIds
        ? Object.entries(selectedVariant.osmStopIds).filter(([, ids]) => ids.length > 0)
        : [];

    return (
        <div className="routes-tab-info">
            <div className="routes-tab-info-grid">
                <div className="routes-tab-info-item">
                    <span className="routes-tab-info-label">GTFS ID</span>
                    <span className="routes-tab-info-value">{route.routeId}</span>
                </div>
                <div className="routes-tab-info-item">
                    <span className="routes-tab-info-label">Short name</span>
                    <span className="routes-tab-info-value">{route.shortName || '\u2014'}</span>
                </div>
                <div className="routes-tab-info-item">
                    <span className="routes-tab-info-label">Type</span>
                    <span className="routes-tab-info-value">
                        {route.routeType || '\u2014'}
                        {route.typeRaw && <span className="routes-tab-info-sub"> ({route.typeRaw})</span>}
                    </span>
                </div>
                {route.agency && (
                    <div className="routes-tab-info-item">
                        <span className="routes-tab-info-label">Agency</span>
                        <span className="routes-tab-info-value">{route.agency}</span>
                    </div>
                )}
                {(route.matchStatus || route.relationMatch || route.stopMatch) && (
                    <div className="routes-tab-info-item">
                        <span className="routes-tab-info-label">Match quality</span>
                        <span className="routes-tab-info-value">
                            <RouteMatchStatus route={route} />
                        </span>
                    </div>
                )}
                {route.stopMatch?.anchored != null && <div className="routes-tab-info-item">
                    <span className="routes-tab-info-label" title="Matched stops have OSM feature claims; anchored stops have a final OSM position">Anchored stops</span>
                    <span className="routes-tab-info-value">{route.stopMatch.anchored}/{route.stopMatch.total}</span>
                </div>}
                {route.modeIgnored != null && (
                    <div className="routes-tab-info-item">
                        <span className="routes-tab-info-label">Mode ignored</span>
                        <span className="routes-tab-info-value">{route.modeIgnored ? 'yes' : 'no'}</span>
                    </div>
                )}
                {route.color && (
                    <div className="routes-tab-info-item">
                        <span className="routes-tab-info-label">Color</span>
                        <span className="routes-tab-info-value">
                            <span className="routes-tab-info-swatch"
                                style={{ background: `#${route.color}` }}
                                title={`#${route.color}`} />
                            {route.color}
                        </span>
                    </div>
                )}
                <div className="routes-tab-info-item">
                    <span className="routes-tab-info-label">Variants</span>
                    <span className="routes-tab-info-value">{variants.length || '\u2026'}</span>
                </div>
                {variants.length > 0 && (
                    <div className="routes-tab-info-item">
                        <span className="routes-tab-info-label">Stop visits</span>
                        <span className="routes-tab-info-value">{stops}</span>
                    </div>
                )}
                {osmRels.size > 0 && (
                    <div className="routes-tab-info-item">
                        <span className="routes-tab-info-label">OSM rel</span>
                        <span className="routes-tab-info-value">
                            {[...osmRels].map((id, i) => (
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
            {selectedVariant?.stopMatch && <div className="routes-tab-variant-match-detail">
                Selected variant: {selectedVariant.stopMatch.matched}/{selectedVariant.stopMatch.total} distinct stop IDs matched
                {selectedVariant.stopMatch.anchored != null && `, ${selectedVariant.stopMatch.anchored} anchored`}
            </div>}
            {matchedStopIds.length > 0 && <details className="routes-tab-stop-links">
                <summary title="OSM features claimed by stop matching; some may be ambiguous and have no final anchor">
                    Matched stop OSM IDs ({matchedStopIds.length})
                </summary>
                <div className="routes-tab-stop-links-list">
                    {matchedStopIds.map(([gtfsId, osmIds]) => <div key={gtfsId}>
                        {gtfsId}: {osmIds.map((id, i) => <span key={id}>
                            {i > 0 && ', '}
                            <a href={osmFeatureUrl(id)} target="_blank" rel="noopener" className="route-osm-link">{id}</a>
                        </span>)}
                    </div>)}
                </div>
            </details>}
            {route.longName && <div className="routes-tab-info-longname">{route.longName}</div>}
        </div>
    );
}
