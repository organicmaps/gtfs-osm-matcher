import { useContext, useEffect, useMemo, useState } from "preact/hooks";
import type { SelectionT } from "../app";
import { SelectionContext } from "../app";
import { LocateMe } from "./locate-me";
import { RoutesMap, type FullRouteDisplayEntry } from "./routes";
import { cls } from "./cls";
import { osmFeatureUrl } from "../services/OSMData";
import { DATA_BASE_URL } from "../config";
import { getRouteVariants, type RouteVariant } from "../services/routeVariants";
import { memoFetch } from "../services/memoFetch";

import "./preview.css";

type IrPreviewRoute = {
    id: string;
    mode?: string;
    name?: string;
    byteOffset: number;
    byteLength: number;
};

type IrPreviewStop = {
    id: string;
    lat: number;
    lon: number;
    name?: string;
    osm?: string;
    /** Present only when the stop is part of a station. */
    type?: 'station' | 'platform';
    /** On a platform: the station stop it belongs to. */
    parent?: string;
    /** On a station: every platform under it. */
    children?: string[] | string;
    platformCode?: string;
    /** On a stop with no OSM position: why the anchoring declined it. */
    noAnchor?: string;
    /** On a station: some of its platforms stand at an OSM bay and some do not. */
    partialPlatforms?: boolean | string;
    /** On a platform: the stop_area gave it this station, and their names do not agree. */
    parentNameDisagrees?: boolean | string;
    /** Where this stop's routes are in ir-preview-routes.ndjson. */
    routesStart?: number;
    routesEnd?: number;
};

// One entry per stop, so selecting the same stop twice costs one request.
const stopRoutesCache: { [key: string]: Promise<IrPreviewRoute[]> } = {};

/**
 * The routes serving one stop, fetched by the range its stop line names. They are not on the
 * stop line itself: it is read to draw a point, and a route list on every stop made the file
 * several times the size of the thing it is for.
 */
function getStopRoutes(reportRegion: string, stop: IrPreviewStop): Promise<IrPreviewRoute[]> {
    const key = `${reportRegion}:${stop.id}`;
    return memoFetch(stopRoutesCache, key, () =>
        fetch(`${DATA_BASE_URL}/${reportRegion}/ir-preview-routes.ndjson`, {
            headers: { Range: `bytes=${stop.routesStart}-${stop.routesEnd}` },
        })
            .then(r => {
                if (!r.ok) throw new Error(`${r.status} for ir-preview-routes.ndjson`);
                return r.text();
            })
            .then(text => JSON.parse(text.trim()).routes as IrPreviewRoute[])
    );
}

/**
 * Why a stop kept the position its feed gave it. The matcher's own vocabulary, spelled out —
 * a reviewer looking at a stop in the wrong place needs to know whether OSM was missing, the
 * match was refused, or the match was taken and then rejected as too far.
 */
const NO_ANCHOR_REASON: { [code: string]: string } = {
    idConflict: 'every feature it matched carries another stop’s id',
    severalPositions: 'the features it matched sit at different positions',
    notANode: 'it matched only a way or a relation, which has no single point to place the stop at',
    tooFar: 'the feature it matched is farther away than the anchoring is allowed to move the stop',
    noPosition: 'the feed gives the stop no coordinate',
    noOsmNearby: 'no OSM feature of a compatible mode was found anywhere near it',
    noMatch: 'OSM features were found nearby, but none satisfied any matching strategy',
    genericOnly: 'the only thing nearby was a stop with no name or code, which is proximity rather than evidence',
    noFeaturePosition: 'the features it matched carry no position of their own',
};

type IrPreviewProps = {
    selection: SelectionT | null;
};

/** The map layer stringifies properties, so a boolean arrives as a boolean or as "true". */
function isTrue(value: boolean | string | undefined): boolean {
    return value === true || value === 'true';
}

/** stringifyProperties in report.tsx serialises arrays to JSON strings. */
function asList(value: string[] | string | undefined): string[] {
    if (!value) return [];
    if (typeof value === 'string') {
        try {
            return JSON.parse(value);
        } catch {
            return [];
        }
    }
    return value;
}

export function Preview({ selection }: IrPreviewProps) {
    const stop = selection?.feature.properties as unknown as IrPreviewStop;
    const lonlat = (selection?.feature.geometry as { coordinates: number[] } & any)?.coordinates;
    const { onReportSelect } = useContext(SelectionContext);
    const reportRegion = (selection as any)?.reportRegion;

    const [routes, setRoutes] = useState<IrPreviewRoute[]>([]);
    const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
    const [variants, setVariants] = useState<RouteVariant[]>([]);
    const [loadingRoutes, setLoadingRoutes] = useState(false);
    const [loadingVariants, setLoadingVariants] = useState(false);

    // stringifyProperties only serialises arrays and objects, and MapLibre keeps numeric
    // GeoJSON properties numeric, so these arrive as the numbers the file wrote.
    const hasRoutes = stop?.routesStart != null;

    // The stop's own routes, one range request, whenever the selection changes.
    useEffect(() => {
        setSelectedRouteId(null);
        setVariants([]);

        if (!stop || !reportRegion || !hasRoutes) {
            setRoutes([]);
            setLoadingRoutes(false);
            return;
        }

        let cancelled = false;
        setRoutes([]);
        setLoadingRoutes(true);
        getStopRoutes(reportRegion, stop)
            .then(r => { if (!cancelled) { setRoutes(r); setLoadingRoutes(false); } })
            .catch(e => {
                console.error('Could not load the routes of stop', stop.id, e);
                if (!cancelled) setLoadingRoutes(false);
            });

        return () => { cancelled = true; };
    }, [stop?.id, reportRegion, hasRoutes]);

    // And the shapes of whichever route was clicked.
    useEffect(() => {
        if (!selectedRouteId || !reportRegion) {
            setVariants([]);
            return;
        }
        const route = routes.find(r => r.id === selectedRouteId);
        if (!route) {
            setVariants([]);
            return;
        }

        let cancelled = false;
        setLoadingVariants(true);
        getRouteVariants(reportRegion, route.id, route.byteOffset, route.byteLength)
            .then(v => {
                if (!cancelled) {
                    setVariants(v);
                    setLoadingVariants(false);
                }
            })
            .catch(e => {
                console.error('Could not load the variants of route', route.id, e);
                if (!cancelled) setLoadingVariants(false);
            });

        return () => { cancelled = true; };
    }, [selectedRouteId, routes, reportRegion]);

    // Memoised because RoutesMap's effect depends on this array's identity: a fresh one on
    // every render wipes the drawn line and re-uploads it.
    const fullRouteEntries = useMemo<FullRouteDisplayEntry[]>(() => {
        const route = routes.find(r => r.id === selectedRouteId);
        const label = route?.name || selectedRouteId || '';
        return variants.map((v, i) => {
            const coordinates: [number, number][] = [];
            for (let j = 0; j < v.latlon.length; j += 2) {
                coordinates.push([v.latlon[j + 1], v.latlon[j]]);
            }
            return {
                routeKey: i === 0 ? label : `${label} #${i + 1}`,
                coordinates
            };
        });
    }, [variants, routes, selectedRouteId]);

    if (import.meta.env.DEV) {
        console.log('Preview', selection);
    }

    if (!stop) {
        return <div id="selection-info">No stop selected</div>;
    }

    const children = asList(stop.children);
    // Bound rather than tested inline, so the id narrows for the link below.
    const anchoredOsmId = stop.osm;

    // Selecting another stop of the same station: the deep-link route already knows how to
    // find one in the loaded preview, so a link is all this needs.
    const stopLink = (id: string) => `#/match-report/${reportRegion}/preview/${encodeURIComponent(id)}`;

    return (
        <div id="selection-info">
            <button className="close-button" onClick={() => onReportSelect(null)} title="Close preview">&times;</button>

            <h4>
                {stop.name || stop.id}
                {stop.platformCode && <span className="platform-code"> platform {stop.platformCode}</span>}
            </h4>

            {lonlat && <LocateMe zoom={18} lonlatFeature={{ lon: lonlat[0], lat: lonlat[1] }} />}

            <div>
                <div>GTFS ID: {stop.id}</div>
                <div>Position: {stop.lat?.toFixed(7)}, {stop.lon?.toFixed(7)}</div>
            </div>

            <div className={cls('anchor-state', anchoredOsmId ? 'anchor-state--anchored' : 'anchor-state--none')}>
                {anchoredOsmId ? (
                    <>
                        <b>Anchored</b> to{' '}
                        <a href={osmFeatureUrl(anchoredOsmId)} target="_blank" rel="noopener">{anchoredOsmId}</a>
                        {' '}&mdash; the stop is written at this feature&rsquo;s position.
                    </>
                ) : (
                    <>
                        <b>Not anchored</b>
                        {stop.noAnchor && <> &mdash; {NO_ANCHOR_REASON[stop.noAnchor] || stop.noAnchor}</>}
                        <div className="anchor-state__note">
                            It keeps the position the feed gave it.
                        </div>
                    </>
                )}
            </div>

            {stop.type === 'station' && (
                <div>
                    <h5>Platforms ({children.length})</h5>
                    {/* All matched needs no attention and none matched is a mapping gap; half
                        is the state where the missing ones are a question about specific bays. */}
                    {isTrue(stop.partialPlatforms) && (
                        <div className="anchor-state anchor-state--none">
                            <b>Partly matched</b> &mdash; some of these platforms stand at an OSM
                            bay and some do not. The ones without are worth a look.
                        </div>
                    )}
                    {children.length === 0 ? (
                        <div>None</div>
                    ) : (
                        <ul className="station-children">
                            {children.map(id => (
                                <li key={id}><a href={stopLink(id)}>{id}</a></li>
                            ))}
                        </ul>
                    )}
                </div>
            )}

            {stop.type === 'platform' && stop.parent && (
                <div>
                    <h5>Station</h5>
                    <div><a href={stopLink(stop.parent)}>{stop.parent}</a></div>
                    {/* A stop_area grouped the two and their names disagree. The relation is
                        the better evidence about OSM, so the link stands — this asks someone to
                        look at the map, not at the feed. The name itself is not to be edited to
                        suit the matcher: where it is the stop's real name, that is vandalism. */}
                    {isTrue(stop.parentNameDisagrees) && (
                        <div className="anchor-state anchor-state--none">
                            <b>Names disagree</b> &mdash; a stop_area groups this stop with that
                            station, but their names do not match. The relation is the stronger
                            evidence, so the link stands; the OSM data is worth a look.
                        </div>
                    )}
                    <div className="anchor-state__note">
                        The station is what the map labels; this platform is where the passenger stands.
                    </div>
                </div>
            )}

            <div>
                <h5>Routes</h5>
                {!hasRoutes ? (
                    <div>No routes</div>
                ) : loadingRoutes ? (
                    <div>Loading routes&hellip;</div>
                ) : routes.length === 0 ? (
                    <div>Could not load routes</div>
                ) : (
                    <>
                        <div>
                            {routes.map(r => (
                                <span
                                    key={r.id}
                                    onClick={() => setSelectedRouteId(prev => prev === r.id ? null : r.id)}
                                    className={cls('route-pill',
                                        (!selectedRouteId || selectedRouteId === r.id) && 'route-pill--selected')}
                                >
                                    {r.mode && <span>{r.mode} </span>}
                                    {r.name || r.id}
                                </span>
                            ))}
                        </div>
                        {selectedRouteId && (
                            loadingVariants ? (
                                <div>Loading route variants&hellip;</div>
                            ) : variants.length > 0 ? (
                                <div>
                                    <RoutesMap fullRoutes={fullRouteEntries} />
                                    {variants.length > 1 && (
                                        <div>
                                            {variants.map((v, i) => (
                                                <span key={v.inx} className={cls('route-variant')}>
                                                    #{i + 1}{v.dir != null ? (v.dir === 0 ? ' \u2191' : ' \u2193') : ''}
                                                </span>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div>No route data found</div>
                            )
                        )}
                    </>
                )}
            </div>
        </div>
    );
}
