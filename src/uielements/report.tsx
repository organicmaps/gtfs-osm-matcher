import { useCallback, useContext, useEffect, useMemo, useRef, useState } from "preact/hooks";
import { MapContext, SelectionContext } from "../app";
import { loadSvgWithColors } from "../map/map";
import type { MapGeoJSONFeature, MapMouseEvent } from "maplibre-gl";

import "./report.css"
import { parseSelectionHash, useHash } from "./routing";
import { DATA_BASE_URL } from "../config";
import { CATEGORIES, CATEGORY_CODES, detailFileFor, parseIndex } from "../services/matchIndex";
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

const PREVIEW_COLOR = '#2c2ca5ff';

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

type GeojsonDataT = {
    features: any[]
    [key: string]: any
};

function buildFeatureCollection(rows: IndexRow[]): GeojsonDataT {
    return {
        type: 'FeatureCollection',
        features: rows.map(r => ({
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [r.lon, r.lat] },
            properties: {
                gtfsStopId: r.id,
                subcategory: r.code,
                type: r.type,
                byteStart: r.byteStart,
                byteEnd: r.byteEnd,
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
    const [previewData, setPreviewData] = useState<GeojsonDataT | null>(null);
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
        setPreviewData(null);
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

    const counts = useMemo(() => {
        const m: { [code: string]: number } = {};
        for (const r of rows) {
            m[r.code] = (m[r.code] || 0) + 1;
        }
        return m;
    }, [rows]);

    const featureCollection = useMemo(() => buildFeatureCollection(rows), [rows]);

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

    const handleStopClick = useCallback((feature?: MapGeoJSONFeature) => {
        if (!feature) return;
        const p = feature.properties;
        const [lon, lat] = (feature.geometry as { coordinates: number[] } & any)?.coordinates || [p.lon, p.lat];
        // The banner describes the attempt in progress, not every attempt since the
        // region loaded; a stale one reads as if the report itself were broken.
        setActionError(null);
        selectStop({
            type: p.type,
            byteStart: p.byteStart,
            byteEnd: p.byteEnd,
            lon, lat,
            subcategory: p.subcategory,
        }, 'map-click').catch(e => {
            console.error('Could not load stop detail', e);
            setActionError(`Could not load the stop: ${e.message}`);
        });
    }, [selectStop]);

    // The preview source is clustered, so below clusterMaxZoom a click lands on a cluster:
    // no id, no coordinates, but truthy enough to open a panel full of undefined. Zoom into
    // it instead — that is what a click on a cluster means anywhere else on a map.
    const handlePreviewSelect = useCallback((feature?: any) => {
        if (!feature) return;
        if (feature.properties?.cluster) {
            const coords = (feature.geometry as { coordinates: [number, number] } & any)?.coordinates;
            // Past clusterMaxZoom, so one click always opens the cluster rather than
            // landing on another one.
            if (map && coords) {
                map.easeTo({ center: coords, zoom: Math.max(map.getZoom() + 2, 11) });
            }
            return;
        }
        updateSelection({ feature, datasetName: 'preview', reportRegion, idTags }, 'map-click');
    }, [map, reportRegion, idTags, updateSelection]);

    // Load ir-preview.ndjson lazily when the preview toggle is on.
    useEffect(() => {
        let cancelled = false;
        if (selectedDatasets['preview'] && !previewData) {
            setActionError(null);
            fetch(`${DATA_BASE_URL}/${reportRegion}/ir-preview.ndjson`)
                .then(r => {
                    if (!r.ok) throw new Error(`${r.status} for ir-preview.ndjson`);
                    return r.text();
                })
                .then(text => {
                    const features = text.trim().split('\n').filter(l => l).map(line => {
                        const stop = JSON.parse(line);
                        return {
                            type: 'Feature',
                            geometry: { type: 'Point', coordinates: [stop.lon, stop.lat] },
                            properties: stop
                        };
                    });
                    // This is the slowest fetch in the panel and covers a whole
                    // region, so a region switch mid-flight would otherwise drop the
                    // previous region's stops onto the new region's map.
                    if (!cancelled) setPreviewData({ type: 'FeatureCollection', features });
                })
                .catch(e => {
                    console.error('Could not read ir-preview.ndjson for', reportRegion, e);
                    if (!cancelled) setActionError(`Could not read the preview: ${e.message}`);
                });
        }
        return () => { cancelled = true; };
    }, [selectedDatasets['preview'], previewData, reportRegion]);

    // Deep-link restore for a stop selection: the category is recovered from the
    // index row (it is no longer encoded in the URL).
    useEffect(() => {
        if (hashSelection?.kind !== 'selection' || rows.length === 0) return;
        const id = hashSelection.id;

        if (selection?.feature.properties.gtfsStopId === id ||
            (selection?.feature.properties.gtfsFeatures as { id: string }[])?.some?.(({ id: fid }) => fid === id)) {
            return;
        }

        const row = rows.find(r => r.id === id);
        if (!row) return;

        // Make sure the stop's sub-category layer is visible.
        updateSelectedDatasets(prev => prev[row.code] ? prev : { ...prev, [row.code]: true });

        setActionError(null);
        selectStop({
            type: row.type,
            byteStart: row.byteStart,
            byteEnd: row.byteEnd,
            lon: row.lon,
            lat: row.lat,
            subcategory: row.code,
        }, 'url-hash').catch(e => {
            console.error('Could not load the deep-linked stop', id, e);
            setActionError(`Could not load the stop: ${e.message}`);
        });
    }, [hashSelection?.kind, hashSelection?.id, rows]);

    // Deep-link restore for a preview selection.
    useEffect(() => {
        if (hashSelection?.kind === 'preview') {
            updateSelectedDatasets(prev => prev['preview'] ? prev : { ...prev, preview: true });
        }
    }, [hashSelection?.kind]);

    useEffect(() => {
        if (hashSelection?.kind !== 'preview' || !previewData) return;
        const id = hashSelection.id;
        if (selection?.feature.properties.id === id) return;

        const found = previewData.features.find((f: any) => String(f.properties.id) === id);
        if (found) {
            updateSelection({ feature: stringifyProperties(found), datasetName: 'preview', reportRegion, idTags }, 'url-hash');
        }
    }, [hashSelection?.kind, hashSelection?.id, previewData]);

    useEffect(() => {
        if (map && selectionSource === 'url-hash' && selection) {
            const lonlat = (selection.feature.geometry as { coordinates: number[] } & any)?.coordinates;
            console.log('about to fly to', selection?.feature);
            map.flyTo({ center: lonlat, zoom: 18, duration: 1 });
        }
    }, [map, selection, selectionSource]);

    const previewOn = !!selectedDatasets['preview'];
    // Preview replaces the report's stops rather than overlaying them. Filtering them all
    // out says so without unmounting the layer, which would drop and re-ingest the whole
    // source on every toggle — and the checkboxes keep their state for when it goes off.
    const selectedCodes = previewOn ? [] : CATEGORY_CODES.filter(c => selectedDatasets[c]);

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
                        disabled={previewOn}
                        ref={el => { if (el) el.indeterminate = !allOn && someOn; }}
                        onChange={e => toggleGroup((e.target as HTMLInputElement).checked)} />
                    <span className={'match-group-title'}>{title}</span>
                    <span className={'match-dataset-count'}>{total}</span>
                </div>
                {codes.map(code => (
                    <div className={'match-child'} key={code}>
                        <input className={'match-dataset-select'} type={'checkbox'} checked={!!selectedDatasets[code]}
                            disabled={previewOn}
                            onChange={e => updateSelectedDatasets({ ...selectedDatasets, [code]: (e.target as HTMLInputElement).checked })} />
                        <span className={'match-dataset'} title={CATEGORIES[code].help}>{CATEGORIES[code].label}</span>
                        <span className={'match-dataset-count'}>{counts[code] || 0}</span>
                    </div>
                ))}
            </div>
        );
    });

    const previewControl = (
        <div className={'match-group'} key={'preview'}>
            <div className={'match-group-header'}>
                <input className={'match-dataset-select'} type={'checkbox'} checked={previewOn}
                    onChange={e => updateSelectedDatasets({
                        ...selectedDatasets, preview: (e.target as HTMLInputElement).checked,
                    })} />
                <span className={'match-dataset'} title={'Show the stop positions and routes the matcher wrote'}>Preview</span>
            </div>
        </div>
    );

    const stopsLayer = rows.length > 0 &&
        <StopsLayer key={reportRegion} layerKey={reportRegion} data={featureCollection}
            selectedCodes={selectedCodes} onClick={handleStopClick} />;

    const previewLayer = previewOn && previewData &&
        <PreviewLayer key={`${reportRegion}:preview`} data={previewData} onClick={handlePreviewSelect} />;

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
        {previewLayer}
        {previewControl}
        {datasetControls}
        <div className={"match-report-meta"}>
            <div className={"section"}>
                <label>GTFS source timestamp </label><div className={"ts-value"}>{gtfsTS}</div>
            </div>
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
    data: GeojsonDataT
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
                'icon-image': ['concat', 'stop-', ['get', 'subcategory']],
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
            onClick && onClick(e.features?.[0]);
        };

        const subscription = { canceled: false, promiseFulfiled: false };

        mapLoaded?.then(async m => {
            await Promise.all(CATEGORY_CODES.map(async code => {
                const iconId = `stop-${code}`;
                if (m.hasImage(iconId)) return;
                const image = await loadSvgWithColors("/stop-var.svg", {
                    ".stroke-fg": ["stroke", CATEGORIES[code].color],
                    ".fill-fg": ["fill", CATEGORIES[code].color],
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
    }, [map, stylingControls, data, layerId, sourceId]);

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

type PreviewLayerProps = {
    data: GeojsonDataT
    onClick?: (feature?: MapGeoJSONFeature, e?: MapLayerClickEvent) => void
}
// The preview overlay: one clustered symbol layer over ir-preview.ndjson. Clustered
// because it holds every stop of the region at once, matched or not.
//
// The ids and the colour are literals rather than props: there is one overlay of this
// kind, and a name prop only bought string-concatenated ids and a callback argument
// every caller ignored.
function PreviewLayer({ data, onClick }: PreviewLayerProps) {

    const mapContext = useContext(MapContext);
    const map = mapContext?.map;
    const mapLoaded = mapContext?.loaded;
    const stylingControls = mapContext?.layerControls;

    useEffect(() => {
        if (!map || !stylingControls) return;

        const sourceId = 'stops-preview';
        const layerId = 'stops-preview';

        const stopsLayer = {
            'id': layerId,
            'type': 'symbol',
            'source': sourceId,
            'layout': {
                'icon-image': 'stop-preview',
                'icon-size': 0.2,
                'icon-allow-overlap': true,
            }
        };

        const source = {
            'type': 'geojson',
            'cluster': true,
            'clusterMaxZoom': 10,
            'clusterRadius': 10,
            'data': data
        };

        const stopsStyle = {
            sources: { [sourceId]: source },
            layers: [stopsLayer]
        };

        const handleClick = (e: MapLayerClickEvent) => {
            onClick && onClick(e.features?.[0], e);
        }

        const iconImageId = 'stop-preview';
        const imageColors = {
            ".stroke-fg": ["stroke", PREVIEW_COLOR] as [string, string],
            ".fill-fg": ["fill", PREVIEW_COLOR] as [string, string],
        };

        const subscription = {
            canceled: false,
            promiseFulfiled: false
        };

        const iconPromise = map.hasImage(iconImageId) ? null :
            loadSvgWithColors("/stop-var.svg", imageColors);

        mapLoaded?.then(async map => {
            if (iconPromise && !map.hasImage(iconImageId)) {
                const image = await iconPromise;
                if (!map.hasImage(iconImageId)) {
                    map.addImage(iconImageId, image);
                }
            }

            subscription.promiseFulfiled = true;
            if (!subscription.canceled) {
                // @ts-ignore
                stylingControls.addOverlayImmediate(stopsStyle);
                if (onClick) {
                    map.on('click', layerId, handleClick);
                }
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

    }, [map, stylingControls, data]);

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
