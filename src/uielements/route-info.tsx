import type { RouteVariant } from "../services/routeVariants";
import { osmFeatureUrl } from "../services/OSMData";
import type { RouteIndexEntry } from "./route-list";
import { cls } from "./cls";

type RouteInfoProps = {
    route: RouteIndexEntry;
    variants: RouteVariant[];
};

export function RouteInfo({ route, variants }: RouteInfoProps) {
    const osmRels = new Set<number>();
    let stops = 0;
    for (const variant of variants) {
        if (variant.osm != null) osmRels.add(variant.osm);
        stops += variant.gtfsIds.length;
    }

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
                {route.matchStatus && (
                    <div className="routes-tab-info-item">
                        <span className="routes-tab-info-label">Match</span>
                        <span className="routes-tab-info-value">
                            <span className={cls('route-match-dot', `route-match-dot--${route.matchStatus}`)} />
                            {route.matchStatus}
                        </span>
                    </div>
                )}
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
                        <span className="routes-tab-info-label">Stops</span>
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
            {route.longName && <div className="routes-tab-info-longname">{route.longName}</div>}
        </div>
    );
}
