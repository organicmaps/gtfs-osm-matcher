import type { RouteVariant } from "../services/routeVariants";
import type { RouteIndexEntry } from "./route-list";
import { osmFeatureUrl } from "../services/OSMData";
import { cls } from "./cls";
import { RouteMatchStatus } from "./route-match-status";

type RouteListItemProps = {
    route: RouteIndexEntry;
    expanded: boolean;
    variants: RouteVariant[];
    variantLoading: boolean;
    selectedVariantInx: number | null;
    onExpand: () => void;
    onSelectVariant: (variantInx: number) => void;
    onFlyTo: () => void;
};

export function RouteListItem({ route, expanded, variants, variantLoading,
    selectedVariantInx, onExpand, onSelectVariant, onFlyTo }: RouteListItemProps) {
    return (
        <div className="routes-tab-row">
            <div className={cls('routes-tab-route-header', expanded && 'routes-tab-route-header--selected')}
                onClick={onExpand}>
                <span className="routes-tab-expand">{expanded ? '▼' : '▶'}</span>
                <span className="routes-tab-route-name">{route.shortName}</span>
                <span style={{ fontSize: '0.75em' }}>({route.routeId})</span>
                {route.longName && <span className="routes-tab-long-name">{route.longName}</span>}
                <RouteMatchStatus route={route} />
                <span className="routes-tab-route-type">{route.routeType}</span>
                <button type="button" className="routes-tab-flyto"
                    title="Fly to route on map"
                    onClick={e => { e.stopPropagation(); onFlyTo(); }}>
                    {'\u21D8'}
                </button>
            </div>
            {expanded && (
                <div className="routes-tab-variants">
                    {variantLoading && <div>Loading variants…</div>}
                    {variants.map((variant, i) => (
                        <div key={variant.inx}
                            className={cls('routes-tab-variant', selectedVariantInx === variant.inx && 'routes-tab-variant--selected')}
                            onClick={() => onSelectVariant(variant.inx)}>
                            <span>
                                #{i + 1}
                                {variant.dir != null ? ` ${variant.dir === 0 ? '\u2191' : '\u2193'}` : ''}
                            </span>
                            <span title="Scheduled stop positions on this variant">{variant.gtfsIds.length} stops</span>
                            {variant.stopMatch && <span title={`${variant.stopMatch.total} distinct GTFS stop IDs, including alternate IDs` +
                                (variant.stopMatch.anchored == null ? '' : `; ${variant.stopMatch.anchored} have a final OSM anchor`)}>
                                {variant.stopMatch.matched}/{variant.stopMatch.total} stops matched
                            </span>}
                            {variant.osm != null && (
                                <a href={osmFeatureUrl(`r${variant.osm}`)} target="_blank" rel="noopener"
                                    className="route-osm-link" onClick={e => e.stopPropagation()}>
                                    ↗ r{variant.osm}
                                </a>
                            )}
                            {(route.relationMatch || route.matchStatus) && variant.osm == null &&
                                <span className="route-status route-status--unmatched">No relation</span>}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
