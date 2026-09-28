import type { RouteIndexEntry } from "./route-list";
import { cls } from "./cls";

type Props = { route: RouteIndexEntry; compact?: boolean };

export function RouteMatchStatus({ route, compact = false }: Props) {
    if (!route.relationMatch && !route.stopMatch && !route.matchStatus) return null;

    const relation = route.relationMatch;
    const stops = route.stopMatch;
    const relationLabel = relation
        ? `Relation variants ${relation.matchedVariants}/${relation.totalVariants}`
        : route.matchStatus === 'matched' ? 'Relation paired'
            : route.matchStatus === 'unmatched' ? 'No relation paired' : 'Relations —';
    const relationTitle = relation
        ? `${relation.matchedVariants} of ${relation.totalVariants} GTFS variants matched to an OSM route relation`
        : route.matchStatus ? 'Older report: route pairing is known; variant coverage is unavailable'
            : 'Route relation coverage is unavailable in this report';
    const stopsLabel = stops ? `Stop IDs ${stops.matched}/${stops.total}` : 'Stop IDs —';
    const stopsTitle = stops
        ? `${stops.matched} of ${stops.total} distinct GTFS stops matched to OSM features` +
            (stops.anchored == null ? '; final OSM anchor count unavailable' : `; ${stops.anchored} have a final OSM anchor`)
        : 'Stop match totals are unavailable in this report';

    return <span className={cls('route-statuses', compact && 'route-statuses--compact')}>
        <span className={cls('route-status', `route-status--${relation?.status || route.matchStatus || 'unknown'}`)}
            title={relationTitle} aria-label={`${relationLabel}. ${relationTitle}`}>
            {relationLabel}
        </span>
        <span className={cls('route-status', `route-status--${stops?.status || 'unknown'}`)}
            title={stopsTitle} aria-label={`${stopsLabel}. ${stopsTitle}`}>
            {stopsLabel}
        </span>
    </span>;
}
