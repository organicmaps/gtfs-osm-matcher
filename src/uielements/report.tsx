import { useCallback, useContext, useEffect, useMemo, useRef, useState } from "preact/hooks";
import { MapContext, SelectionContext, ViewOptionsContext } from "../app";
import { loadSvgWithColors } from "../map/map";
import type { GeoJSONSource, MapGeoJSONFeature, MapMouseEvent } from "maplibre-gl";
import type { FeatureCollection } from "geojson";

import "./report.css"
import { parseSelectionHash, useHash } from "./routing";
import { DATA_BASE_URL } from "../config";
import { CATEGORIES, CATEGORY_CODES, detailFileFor, parseIndex } from "../services/matchIndex";
import { PreviewSwitch } from "./switch";
import { loadUnmatchedOsmStops } from "../services/osmIndex";
import type { OsmIndexRow } from "../services/osmIndex";
import type { Group, IndexRow } from "../services/matchIndex";

var shouldUpdateBoundsSignal = {
    value: false
};

window.addEventListener('ShouldUpdateBounds',
    () => shouldUpdateBoundsSignal.value = true
);

const GROUPS: { group: Group; title: string }[] = [
    { group: 'matched', title: 'Matched' },
    { group: 'not-matched', title: 'Not matched' },
];

// A stop whose calls this run dealt to the places it stands for is drawn grey rather than in
// its match category's colour: it is still matched, still filtered by that category's
// checkbox, and still in the data -- what moved is its departures. Only `dissolved` is drawn
// this way. `wouldDissolve` and `dissolvable` describe a run that acted on nothing, so those
// stops keep their category's own pin; the panel says what would have happened.
const DISSOLVED_ICON = 'stop-dissolved';
const DISSOLVED_COLOR = '#8b8b8b';

type DatatsetsSelectonT = {
    [key: string]: boolean
}
const defaultSets = { nom: true, nos: true } as DatatsetsSelectonT;

export type Report = {
    region: string;
    version: string;
    source?: string;

    idTags: {
        [key: string]: number
    };

    liveUpdates?: boolean;

    /**
     * What the run did about dissolution on this feed: acted, only detected and marked, or
     * neither. Absent in older reports. `off` is a real answer, not a missing one: the
     * analysis is asked for per feed, so an unmarked feed says nothing on its own.
     */
    dissolution?: 'on' | 'analysis' | 'off';

    matchStats: {
        total: number;
        matchId: number;
        noMatch: number;
        empty: number;
    };

    matchMeta: {
        coveredPbfSources: {
            path: string,
            fileTimestamp: number
        }[]
        gtfsTimeStamp: number
        generationTimeStamp: number
        matcherVersion: number | string
        gtfsBbox?: {
            left: number
            right: number
            top: number
            bottom: number
        }
    };

}

type StopLocator = {
    type: string
    byteStart: number
    byteEnd: number
    lon: number
    lat: number
    subcategory: string
}

/**
 * The stops, drawn either where their feed puts them or where the matcher anchored them.
 *
 * <p>One collection either way, with the same feature ids: the preview is a re-projection of
 * the report's own markers, not a second dataset over them. That is what lets the switch be
 * flipped with a stop selected — the selected feature still exists, so the panel stays open
 * and the marker simply moves. A stop the anchoring refused keeps its feed position, since
 * there is nowhere else to draw it.
 *
 * <p>The feed position is deliberately not carried in the properties: a click resolves the
 * stop through its index row, which holds both positions, so nothing downstream has to
 * guess which one a marker's geometry is.
 */
function buildFeatureCollection(rows: IndexRow[], anchored: boolean,
        dissolutionApplied: boolean): FeatureCollection {
    return {
        type: 'FeatureCollection',
        features: rows.map(r => ({
            type: 'Feature',
            geometry: {
                type: 'Point',
                coordinates: anchored && r.anchorLon !== null && r.anchorLat !== null
                    ? [r.anchorLon, r.anchorLat]
                    : [r.lon, r.lat],
            },
            properties: {
                gtfsStopId: r.id,
                subcategory: r.code,
                type: r.type,
                byteStart: r.byteStart,
                byteEnd: r.byteEnd,
                // Grey only where this run actually dealt the stop's visits: the same bit on a
                // feed that was only measured means "would", and nothing happened to it.
                dissolved: r.dissolutionPlanned && dissolutionApplied,
            }
        }))
    };
}

type MatchReportProps = {
    reportRegion: string;
    reportData: Report;
}
export function MatchReport({ reportRegion, reportData }: MatchReportProps) {
    const { selection, selectionSource, updateSelection } = useContext(SelectionContext);
    const map = useContext(MapContext)?.map;

    const hashSelection = parseSelectionHash(useHash());
    const matchMeta = reportData.matchMeta;
    const idTags = reportData.idTags;

    if (import.meta.env.DEV) {
        console.log('hashSelection', hashSelection);
        console.log('reportData', reportData);
    }

    useEffect(() => {
        if (map && matchMeta?.gtfsBbox && shouldUpdateBoundsSignal.value) {
            const { left, bottom, right, top } = matchMeta.gtfsBbox;
            map.fitBounds([
                [left, bottom],
                [right, top]
            ], {
                padding: 50
            });
            shouldUpdateBoundsSignal.value = false;
        }
    }, [map, matchMeta, shouldUpdateBoundsSignal]);

    const [rows, setRows] = useState<IndexRow[]>([]);
    const [selectedDatasets, updateSelectedDatasets] = useState<DatatsetsSelectonT>(defaultSets);
    // Shared with the selection panel: the same switch appears there, so the state cannot
    // live in this component's own dataset map.
    const { previewOn, setPreviewAvailable } = useContext(ViewOptionsContext);
    // Two channels, because the two messages live on different clocks. The index
    // message is a property of the loaded region and stays true until the region
    // changes; the action message describes one click. Sharing one state let a
    // click erase the banner explaining why stops were missing, with the stops
    // still missing.
    const [indexError, setIndexError] = useState<string | null>(null);
    const [actionError, setActionError] = useState<string | null>(null);

    // Load the search index once per region.
    useEffect(() => {
        let cancelled = false;
        setRows([]);
        if (import.meta.env.DEV) {
            console.log('Loading index', reportRegion);
        }
        setIndexError(null);
        setActionError(null);
        fetch(`${DATA_BASE_URL}/${reportRegion}/index.tsv?t=${Date.now()}`)
            .then(r => {
                if (!r.ok) throw new Error(`${r.status} for index.tsv`);
                return r.text();
            })
            .then(t => {
                if (cancelled) return;
                const { rows: parsed, skipped } = parseIndex(t);
                // A code this build has no entry for gets no icon, no checkbox and no
                // count, so its stops are simply absent from the map -- which looks
                // exactly like a region that has none. Say so instead.
                const unknown = [...new Set(parsed.map(r => r.code))].filter(c => !CATEGORIES[c]);
                const problems = [];
                if (unknown.length > 0) {
                    problems.push(`categories this build does not know: ${unknown.join(', ')}`);
                }
                if (skipped > 0) {
                    problems.push(`${skipped} row${skipped === 1 ? '' : 's'} could not be read`);
                }
                if (problems.length > 0) {
                    setIndexError(`index.tsv: ${problems.join('; ')}`);
                }
                setRows(parsed);
            })
            .catch(e => {
                console.error('Could not read index.tsv for', reportRegion, e);
                if (!cancelled) setIndexError(`Could not read index.tsv: ${e.message}`);
            });
        return () => { cancelled = true; };
    }, [reportRegion]);

    // Per category: how many stops there are, and how many of them the matcher anchored.
    // The second is what the preview can actually move, and the categories selected by
    // default (the unmatched ones) have none of it — so without the count beside the switch
    // its first use looks like a broken control.
    const { counts, anchoredCounts, anchoredTotal } = useMemo(() => {
        const counts: { [code: string]: number } = {};
        const anchoredCounts: { [code: string]: number } = {};
        let anchoredTotal = 0;
        for (const r of rows) {
            counts[r.code] = (counts[r.code] || 0) + 1;
            if (r.anchorLon !== null && r.anchorLat !== null) {
                anchoredCounts[r.code] = (anchoredCounts[r.code] || 0) + 1;
                anchoredTotal++;
            }
        }
        return { counts, anchoredCounts, anchoredTotal };
    }, [rows]);

    // The switch lives in App, so it outlives the region and the report list. Rather than
    // turning it off after the fact -- which stored a wrong state, drew from it, and then
    // corrected it -- nothing reads it while the report has nothing to preview, and the
    // switch tells the panel's copy of itself to stop offering the control.
    const previewing = previewOn && anchoredTotal > 0;

    useEffect(() => {
        setPreviewAvailable(anchoredTotal > 0);
        return () => setPreviewAvailable(false);
    }, [anchoredTotal, setPreviewAvailable]);

    // What the matcher looked at and did not use, drawn beside the stops it placed. Fetched
    // only while the preview is on: it is the largest file the report publishes, and a
    // session that never looks at the preview should never pay for it.
    const [showUnmatchedOsm, setShowUnmatchedOsm] = useState(false);
    const [unassignedRows, setUnassignedRows] = useState<OsmIndexRow[] | null>(null);
    useEffect(() => {
        if (!showUnmatchedOsm) return;
        let cancelled = false;
        loadUnmatchedOsmStops(reportRegion)
            .then(rows => { if (!cancelled) setUnassignedRows(rows); })
            .catch(e => {
                console.error('Could not read osm-index.tsv.gz for', reportRegion, e);
                setActionError(`Could not read osm-index.tsv.gz: ${e.message}`);
            });
        return () => { cancelled = true; };
    }, [showUnmatchedOsm, reportRegion]);

    const unassigned = useMemo(() => {
        if (!unassignedRows) return null;
        return {
            type: 'FeatureCollection',
            features: unassignedRows.map(r => ({
                type: 'Feature',
                geometry: { type: 'Point', coordinates: [r.lon, r.lat] },
                properties: {
                    osmId: r.osmId, flavour: r.flavour, name: r.name,
                    seenBy: r.seenBy, nearestM: r.nearestM,
                },
            })),
        } as FeatureCollection;
    }, [unassignedRows]);

    // A click gives a feature, and the report answers about a stop; this is the join.
    const rowsById = useMemo(() => new Map(rows.map(r => [r.id, r])), [rows]);

    const dissolutionApplied = reportData.dissolution === 'on';

    // Both projections of the same rows, built at most once each and kept: a flip used to
    // rebuild every feature of the region and re-upload the lot, and on germany-local that is
    // 433,086 features of which 272,142 are identical between the two.
    const collections = useMemo(() => {
        const built: { [k: string]: FeatureCollection } = {};
        return (anchored: boolean) => {
            const key = anchored ? 'anchored' : 'feed';
            return built[key] ??= buildFeatureCollection(rows, anchored, dissolutionApplied);
        };
    }, [rows, dissolutionApplied]);

    const featureCollection = collections(previewing);

    // Range-fetch a single stop's detail object and turn it into a selection.
    const selectStop = useCallback(async (loc: StopLocator, source: 'map-click' | 'url-hash') => {
        const file = detailFileFor(loc.type);

        const res = await fetch(`${DATA_BASE_URL}/${reportRegion}/${file}`, {
            headers: { Range: `bytes=${loc.byteStart}-${loc.byteEnd}` },
        });
        // detailFileFor falls back to the combined file for an unknown type, so a report
        // that does not have one answers 404 — and the error body parses as nothing.
        if (!res.ok) {
            throw new Error(`${res.status} for ${file} ${loc.byteStart}-${loc.byteEnd}`);
        }
        const detail = JSON.parse(await res.text());

        const feature = stringifyProperties({
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [loc.lon, loc.lat] },
            properties: { ...detail, lon: loc.lon, lat: loc.lat },
        });

        updateSelection({ feature, datasetName: loc.subcategory, reportRegion, idTags }, source);
    }, [reportRegion, idTags, updateSelection]);

    // Both ways into a selection go through the index row rather than through the drawn
    // marker. With the preview on a marker stands at its anchor, which is usually the
    // matched OSM feature itself — a panel measuring from there would report every matched
    // stop as 0 m from the feature it should be judged against.
    const selectRow = useCallback((row: IndexRow, source: 'map-click' | 'url-hash') => {
        // The banner describes the attempt in progress, not every attempt since the
        // region loaded; a stale one reads as if the report itself were broken.
        setActionError(null);
        selectStop({
            type: row.type,
            byteStart: row.byteStart,
            byteEnd: row.byteEnd,
            lon: row.lon,
            lat: row.lat,
            subcategory: row.code,
        }, source).catch(e => {
            console.error('Could not load stop detail', row.id, e);
            setActionError(`Could not load the stop: ${e.message}`);
        });
    }, [selectStop]);

    const handleStopClick = useCallback((feature?: MapGeoJSONFeature) => {
        if (!feature) return;
        const row = rowsById.get(feature.properties.gtfsStopId);
        if (!row) {
            // Every feature was built from a row, so this is a bug rather than bad data.
            console.error('Clicked a stop the index does not have', feature.properties);
            return;
        }
        selectRow(row, 'map-click');
    }, [rowsById, selectRow]);

    // Deep-link restore for a stop selection: the category is recovered from the
    // index row (it is no longer encoded in the URL).
    useEffect(() => {
        if (!hashSelection || rows.length === 0) return;
        const id = hashSelection.id;

        if (selection?.feature.properties.gtfsStopId === id ||
            (selection?.feature.properties.gtfsFeatures as { id: string }[])?.some?.(({ id: fid }) => fid === id)) {
            return;
        }

        const row = rowsById.get(id);
        if (!row) {
            // A `/selection/` link naming a stop this report does not have is worth saying out
            // loud. A `/preview/` one is not: those were written by the preview panel that no
            // longer exists, and some of their ids -- generated stations -- were never rows of
            // any index.tsv, so the red banner would accuse the report of losing a stop it
            // never had.
            if (hashSelection.legacy) {
                console.warn('Ignoring a preview-era link to', id);
            } else {
                setActionError(`No stop ${id} in this report`);
            }
            return;
        }

        // Make sure the stop's sub-category layer is visible.
        updateSelectedDatasets(prev => prev[row.code] ? prev : { ...prev, [row.code]: true });

        selectRow(row, 'url-hash');
    }, [hashSelection?.id, rowsById]);

    useEffect(() => {
        if (map && selectionSource === 'url-hash' && selection) {
            // Where the marker is, not where the feed put the stop: with the preview on the
            // two differ by up to 742 m on swiss-opendata, and the camera would land on empty
            // map beside a stop whose panel is open.
            const row = rowsById.get(selection.feature.properties?.gtfsStopId);
            const drawnAt = previewing && row?.anchorLon !== null && row?.anchorLat != null
                ? [row!.anchorLon, row!.anchorLat]
                : (selection.feature.geometry as { coordinates: number[] } & any)?.coordinates;
            map.flyTo({ center: drawnAt as [number, number], zoom: 18, duration: 1 });
        }
    }, [map, selection, selectionSource]);

    // The preview moves the stops rather than replacing them, so the category filters keep
    // working while it is on -- which is the point: a category is still the thing you are
    // looking at, and now you are looking at where the matcher put it.
    const selectedCodes = CATEGORY_CODES.filter(c => selectedDatasets[c]);

    const anchoredShown = selectedCodes.reduce((sum, c) => sum + (anchoredCounts[c] || 0), 0);

    const datasetControls = GROUPS.map(({ group, title }) => {
        const codes = CATEGORY_CODES.filter(c => CATEGORIES[c].group === group && (counts[c] || 0) > 0);
        if (codes.length === 0) return null;

        const total = codes.reduce((s, c) => s + (counts[c] || 0), 0);
        const allOn = codes.every(c => selectedDatasets[c]);
        const someOn = codes.some(c => selectedDatasets[c]);

        const toggleGroup = (checked: boolean) => {
            updateSelectedDatasets(prev => {
                const next = { ...prev };
                codes.forEach(c => next[c] = checked);
                return next;
            });
        };

        return (
            <div className={'match-group'} key={group}>
                <div className={'match-group-header'}>
                    <input className={'match-dataset-select'} type={'checkbox'} checked={allOn}
                        ref={el => { if (el) el.indeterminate = !allOn && someOn; }}
                        onChange={e => toggleGroup((e.target as HTMLInputElement).checked)} />
                    <span className={'match-group-title'}>{title}</span>
                    <span className={'match-dataset-count'}>{total}</span>
                </div>
                {codes.map(code => (
                    <div className={'match-child'} key={code}>
                        <input className={'match-dataset-select'} type={'checkbox'} checked={!!selectedDatasets[code]}
                            onChange={e => updateSelectedDatasets({ ...selectedDatasets, [code]: (e.target as HTMLInputElement).checked })} />
                        <span className={'match-dataset'} title={CATEGORIES[code].help}>{CATEGORIES[code].label}</span>
                        <span className={'match-dataset-count'}>{counts[code] || 0}</span>
                    </div>
                ))}
            </div>
        );
    });

    // Offered only where the report can honour it, the way a category control is offered only
    // when the category has stops: an index.tsv written before the anchor columns parses fine
    // and anchors nothing. The count says how many of the *shown* stops it can move.
    const previewControl = anchoredTotal > 0 && (
        <div className={'match-group'} key={'preview'}>
            <div className={'match-group-header'}>
                <PreviewSwitch />
                <span className={'match-dataset-count'}
                    title={'Stops of the shown categories the matcher anchored'}>{anchoredShown}</span>
            </div>
        </div>
    );

    // A dataset of its own, after the GTFS ones and shaped like them: it is the same kind of
    // thing — a set of features the map either draws or does not — and it reads as one only
    // if it sits at their level rather than under the switch.
    const unmatchedOsmControl = (
        <div className={'match-group'} key={'osm'}>
            <div className={'match-group-header'}>
                <input className={'match-dataset-select'} type={'checkbox'} checked={showUnmatchedOsm}
                    onChange={e => setShowUnmatchedOsm((e.target as HTMLInputElement).checked)} />
                <span className={'match-group-title'}
                    title={'OSM stops and stations the matcher was offered for some GTFS stop'
                        + ' and nothing matched, and that nothing else in the pipeline claims.'
                        + ' Shown beside any of the categories above; it moves nothing.'}>
                    Unmatched OSM stops
                </span>
                <span className={'match-dataset-count'}>
                    {unassigned ? unassigned.features.length : ''}
                </span>
            </div>
        </div>
    );

    const stopsLayer = rows.length > 0 &&
        <StopsLayer key={reportRegion} layerKey={reportRegion} data={featureCollection}
            selectedCodes={selectedCodes} onClick={handleStopClick} />;

    const unassignedLayer = showUnmatchedOsm && unassigned &&
        <UnassignedOsmLayer key={reportRegion} layerKey={reportRegion} data={unassigned} />;

    const gtfsTS = new Date(matchMeta.gtfsTimeStamp).toUTCString();
    const osmSourcesTS = matchMeta.coveredPbfSources.map(({ path, fileTimestamp }) => {
        return <div>
            <label>{path} </label><div className={"ts-value"}>{new Date(fileTimestamp).toUTCString()}</div>
        </div>
    });

    return (<div>
        <h2 className={"report-header"}>{reportRegion}</h2>
        {indexError && <div className={"report-load-error"} role={"alert"}>{indexError}</div>}
        {actionError && <div className={"report-load-error"} role={"alert"}>{actionError}</div>}
        {stopsLayer}
        {unassignedLayer}
        {previewControl}
        {datasetControls}
        {unmatchedOsmControl}
        <div className={"match-report-meta"}>
            <div className={"section"}>
                <label>GTFS source timestamp </label><div className={"ts-value"}>{gtfsTS}</div>
            </div>
            {reportData.dissolution && <div className={"section"}>
                {/* Without this a feed with nothing to dissolve and a feed with the feature
                    switched off read exactly the same on the map. */}
                <label>Stop dissolution </label>
                <div className={"ts-value"}>{reportData.dissolution}</div>
            </div>}
            <div className={"section"}>
                <label>OSM Sources timestamps</label>
                {osmSourcesTS}
            </div>
        </div>
    </div>)

}

type MapLayerClickEvent = MapMouseEvent & {
    features?: MapGeoJSONFeature[];
} & Object;

function buildFilter(codes: string[]) {
    return ['in', ['get', 'subcategory'], ['literal', codes]] as any;
}

type StopsLayerProps = {
    layerKey: string
    data: FeatureCollection
    selectedCodes: string[]
    onClick?: (feature?: MapGeoJSONFeature) => void
}
// A single geojson source/symbol layer holding every stop. Categories are shown
// or hidden with map.setFilter on the `subcategory` property; icon color is
// data-driven by `subcategory`. The source data is never rebuilt on toggle.
function StopsLayer({ layerKey, data, selectedCodes, onClick }: StopsLayerProps) {
    const mapContext = useContext(MapContext);
    const map = mapContext?.map;
    const mapLoaded = mapContext?.loaded;
    const stylingControls = mapContext?.layerControls;

    const sourceId = `stops-${layerKey}`;
    const layerId = `stops-${layerKey}`;

    const selectedRef = useRef(selectedCodes);
    selectedRef.current = selectedCodes;

    // The click handler, held rather than listed in the deps below: re-creating the source
    // is not how this layer changes -- the preview flips every stop's geometry, and tearing
    // the source down on each flip drops the layer often enough that the switch stops
    // appearing to work. onClick is a new function on every App render, so without this the
    // map would keep calling the one it was mounted with.
    const onClickRef = useRef(onClick);
    onClickRef.current = onClick;

    // Stored layer/source spec — addOverlayImmediate keeps it by reference, so
    // mutating its `filter` keeps base-style switches consistent.
    const specRef = useRef<any>(null);

    useEffect(() => {
        if (!map || !stylingControls) return;

        const layerSpec = {
            'id': layerId,
            'type': 'symbol',
            'source': sourceId,
            'filter': buildFilter(selectedRef.current),
            'layout': {
                'icon-image': ['case',
                    ['boolean', ['get', 'dissolved'], false], DISSOLVED_ICON,
                    ['concat', 'stop-', ['get', 'subcategory']],
                ] as any,
                'icon-size': 0.2,
                'icon-allow-overlap': true,
            }
        };

        const source = {
            'type': 'geojson',
            'data': data
        };

        const stopsStyle = {
            sources: { [sourceId]: source },
            layers: [layerSpec]
        };
        specRef.current = stopsStyle;

        const handleClick = (e: MapLayerClickEvent) => {
            onClickRef.current?.(e.features?.[0]);
        };

        const subscription = { canceled: false, promiseFulfiled: false };

        mapLoaded?.then(async m => {
            const iconColors: { [iconId: string]: string } = { [DISSOLVED_ICON]: DISSOLVED_COLOR };
            CATEGORY_CODES.forEach(code => iconColors[`stop-${code}`] = CATEGORIES[code].color);

            await Promise.all(Object.entries(iconColors).map(async ([iconId, color]) => {
                if (m.hasImage(iconId)) return;
                const image = await loadSvgWithColors("/stop-var.svg", {
                    ".stroke-fg": ["stroke", color],
                    ".fill-fg": ["fill", color],
                });
                if (!m.hasImage(iconId)) {
                    m.addImage(iconId, image);
                }
            }));

            subscription.promiseFulfiled = true;
            if (subscription.canceled) return;

            // @ts-ignore
            stylingControls.addOverlayImmediate(stopsStyle);
            if (onClick) {
                map.on('click', layerId, handleClick);
            }
        });

        return () => {
            subscription.canceled = true;
            if (subscription.promiseFulfiled) {
                // @ts-ignore
                stylingControls.removeOverlayImmediate(stopsStyle);
                if (onClick) {
                    map.off('click', layerId, handleClick);
                }
            }
        };
    }, [map, stylingControls, layerId, sourceId]);

    // New geometry — the preview moving every stop to where the matcher anchored it — goes
    // to the live source. The spec keeps a copy so a base-style switch re-adds the layer
    // with what is on screen rather than with what it was created from.
    useEffect(() => {
        if (!map) return;
        if (specRef.current) {
            specRef.current.sources[sourceId].data = data;
        }
        const source = map.getSource(sourceId) as GeoJSONSource | undefined;
        source?.setData(data);
    }, [map, data, sourceId]);

    // Update visibility when the selected sub-categories change.
    useEffect(() => {
        if (!map) return;
        const filter = buildFilter(selectedCodes);
        if (specRef.current) {
            specRef.current.layers[0].filter = filter;
        }
        if (map.getLayer(layerId)) {
            map.setFilter(layerId, filter);
        }
    }, [map, layerId, selectedCodes.join(',')]);

    return <></>;
}

type UnassignedOsmLayerProps = {
    layerKey: string
    data: FeatureCollection
};

/**
 * The OSM features the matcher was offered and nothing matched, while the preview is on.
 *
 * <p>Preview answers "where did the matcher put this stop"; this answers the other half of the
 * same question — what was standing there that it did not use. Zürich Central has seven
 * platforms named <i>Central</i> within 46 m of the stop, matched by nothing, and no view of
 * the report showed them before.
 *
 * <p>Circles rather than icons: there are tens of thousands of them, and a ring reads as
 * "something OSM has here" rather than as another stop of the feed.
 */
function UnassignedOsmLayer({ layerKey, data }: UnassignedOsmLayerProps) {
    const mapContext = useContext(MapContext);
    const map = mapContext?.map;
    const mapLoaded = mapContext?.loaded;
    const stylingControls = mapContext?.layerControls;

    const sourceId = `unassigned-osm-${layerKey}`;
    const layerId = `unassigned-osm-${layerKey}`;

    const specRef = useRef<any>(null);

    useEffect(() => {
        if (!map || !stylingControls) return;

        const spec = {
            sources: {
                [sourceId]: { 'type': 'geojson', 'data': data },
            },
            layers: [{
                'id': layerId,
                'type': 'circle',
                'source': sourceId,
                'paint': {
                    'circle-radius': ['interpolate', ['linear'], ['zoom'], 12, 2, 17, 6] as any,
                    'circle-color': '#c23b22',
                    'circle-stroke-width': 1,
                    'circle-stroke-color': '#fff',
                    'circle-opacity': 0.75,
                },
            }],
        };
        specRef.current = spec;

        const subscription = { canceled: false, promiseFulfiled: false };
        mapLoaded?.then(() => {
            subscription.promiseFulfiled = true;
            if (subscription.canceled) return;
            // @ts-ignore — the same immediate add the report's own overlays use, so the layer
            // survives a base-style switch.
            stylingControls.addOverlayImmediate(spec);
            // Under the stop pins: a stop the matcher did place must never be hidden by a
            // feature it did not.
            if (map.getLayer(layerId) && map.getLayer(`stops-${layerKey}`)) {
                map.moveLayer(layerId, `stops-${layerKey}`);
            }
        });

        return () => {
            subscription.canceled = true;
            if (subscription.promiseFulfiled) {
                // @ts-ignore
                stylingControls.removeOverlayImmediate(spec);
            }
        };
    }, [map, stylingControls, layerId, sourceId]);

    useEffect(() => {
        if (!map) return;
        if (specRef.current) {
            specRef.current.sources[sourceId].data = data;
        }
        const source = map.getSource(sourceId) as GeoJSONSource | undefined;
        source?.setData(data);
    }, [map, data, sourceId]);

    return <></>;
}

function stringifyProperties(f: any) {
    const properties = Object.fromEntries(Object.entries(f.properties).map(([k, v]) => {
        if (Array.isArray(v) || (v !== null && typeof v === 'object')) {
            return [k, JSON.stringify(v)];
        }

        return [k, v]
    }));

    return {
        ...f,
        properties
    } as MapGeoJSONFeature;
}
