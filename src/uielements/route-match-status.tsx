import type { RouteIndexEntry } from "./route-list";
import { cls } from "./cls";

type Props = { route: RouteIndexEntry; compact?: boolean };

export function RouteMatchStatus({ route, compact = false }: Props) {
    if (!route.relationMatch && !route.stopMatch) return null;

    const relation = route.relationMatch;
    const stops = route.stopMatch;
    const relationLabel = relation
        ? `Relation variants ${relation.matchedVariants}/${relation.totalVariants}`
        : 'Relations n/a';
    const relationTitle = relation
        ? `${relation.matchedVariants} of ${relation.totalVariants} GTFS variants matched to an OSM route relation`
        : 'Route relation coverage is unavailable in this report';
    const stopsLabel = stops ? `Stops ${stops.matched}/${stops.total}` : 'Stops n/a';
    const stopsTitle = stops
        ? `${stops.matched} of ${stops.total} distinct GTFS stops matched to OSM features` +
            (stops.anchored == null ? '; final OSM anchor count unavailable' : `; ${stops.anchored} have a final OSM anchor`)
        : 'Stop match totals are unavailable in this report';

    return <span className={cls('route-statuses', compact && 'route-statuses--compact')}>
        <span className={cls('route-status', `route-status--${relation?.status || 'unknown'}`)}
            title={relationTitle} aria-label={`${relationLabel}. ${relationTitle}`}>
            {relationLabel}
        </span>
        <span className={cls('route-status', `route-status--${stops?.status || 'unknown'}`)}
            title={stopsTitle} aria-label={`${stopsLabel}. ${stopsTitle}`}>
            {stopsLabel}
        </span>
    </span>;
}
