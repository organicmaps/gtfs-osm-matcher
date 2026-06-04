import { useCallback, useContext, useEffect, useMemo, useRef, useState } from "preact/hooks";
import { MapContext, SelectionContext } from "../app";
import { loadSvgWithColors } from "../map/map";
import type { MapGeoJSONFeature, MapMouseEvent } from "maplibre-gl";

import "./report.css"
import { parseSelectionHash, useHash } from "./routing";
import { DATA_BASE_URL } from "../config";

var shouldUpdateBoundsSignal = {
    value: false
};

window.addEventListener('ShouldUpdateBounds',
    () => shouldUpdateBoundsSignal.value = true
);

// Category model, keyed by the index.tsv `status_detailed` 3-letter code.
// Two top-level groups (matched / not-matched); the rest are sub-categories.
type Group = 'matched' | 'not-matched';
type Category = {
    group: Group;
    label: string;
    color: string;
    help: string;
};

const CATEGORIES: { [code: string]: Category } = {
    mid: { group: 'matched', label: 'match-id', color: 'green', help: 'Stops matched by GTFS Id or Code' },
    mrt: { group: 'matched', label: 'match-routes', color: 'green', help: 'Stops matched by routes going through this stop' },
    mnm: { group: 'matched', label: 'match-name', color: 'green', help: 'Stops matched by Name' },
    nic: { group: 'matched', label: 'name-id-conflict', color: 'green', help: 'Stops matched by Name but mismatched by id' },
    gen: { group: 'matched', label: 'match-generic', color: 'green', help: 'Matched to a stop without name or code nearby' },
    sep: { group: 'matched', label: 'separated-cluster', color: '#467d18', help: 'Many OSM stops matched one or many GTFS, but successfuly separated' },
    clu: { group: 'matched', label: 'cluster', color: '#80520e', help: 'Many OSM stops matched one or many GTFS by name' },
    mto: { group: 'matched', label: 'many-to-one', color: '#93cf32ff', help: 'Many OSM stops matched exactly one GTFS by name' },
    hub: { group: 'matched', label: 'transit-hub', color: '#b5b20bff', help: 'Many OSM platforms or stops matched to one Station by name' },
    nom: { group: 'not-matched', label: 'no-match', color: 'red', help: 'No osm element matched' },
    nos: { group: 'not-matched', label: 'no-osm', color: 'black', help: 'No OSM elements of matching transport mode found in the area' },
};

const CATEGORY_CODES = Object.keys(CATEGORIES);

const GROUPS: { group: Group; title: string }[] = [
    { group: 'matched', title: 'Matched' },
    { group: 'not-matched', title: 'Not matched' },
];

// index.tsv `type` column -> detail NDJSON file
const fileFor: { [type: string]: string } = {
    mat: 'matches.ndjson',
    clu: 'clusters.ndjson',
    nos: 'no-osm.ndjson',
};

const PREVIEW_COLOR = '#2c2ca5ff';

type DatatsetsSelectonT = {
    [key: string]: boolean
}
const defaultSets = { nom: true, nos: true } as DatatsetsSelectonT;

export type Report = {
    region: string;
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
        matcherVersion: number | string
        gtfsBbox?: {
            left: number
            right: number
            top: number
            bottom: number
        }
    };

}

// One parsed row of index.tsv (search_terms column 9 is intentionally ignored —
// it will power a future search feature and is not part of the map data).
type IndexRow = {
    id: string
    status: string
    code: string
    type: string
    lon: number
    lat: number
    byteStart: number
    byteEnd: number
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

function parseIndex(tsv: string): IndexRow[] {
    const lines = tsv.split('\n');
    const rows: IndexRow[] = [];
    // line 0 is the header
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i];
        if (!line) continue;
        const c = line.split('\t');
        if (c.length < 8) continue;
        rows.push({
            id: c[0],
            status: c[1],
            code: c[2],
            type: c[3],
            lon: parseFloat(c[4]),
            lat: parseFloat(c[5]),
            byteStart: parseInt(c[6], 10),
            byteEnd: parseInt(c[7], 10),
        });
    }
    return rows;
}

function buildFeatureCollection(rows: IndexRow[]): GeojsonDataT {
    return {
        type: 'FeatureCollection',
        features: rows.map(r => ({
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [r.lon, r.lat] },
            properties: {
                gtfsStopId: r.id,
                category: r.status === 'm' ? 'matched' : 'not-matched',
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

    // Load the search index once per region.
    useEffect(() => {
        let cancelled = false;
        setRows([]);
        setPreviewData(null);
        if (import.meta.env.DEV) {
            console.log('Loading index', reportRegion);
        }
        fetch(`${DATA_BASE_URL}/${reportRegion}/index.tsv`)
            .then(r => r.text())
            .then(t => { if (!cancelled) setRows(parseIndex(t)); });
        return () => { cancelled = true; };
    }, [reportRegion]);

    const featureCollection = useMemo(() => buildFeatureCollection(rows), [rows]);

    const counts = useMemo(() => {
        const m: { [code: string]: number } = {};
        for (const r of rows) {
            m[r.code] = (m[r.code] || 0) + 1;
        }
        return m;
    }, [rows]);

    // Range-fetch a single stop's detail object and turn it into a selection.
    const selectStop = useCallback(async (loc: StopLocator, source: 'map-click' | 'url-hash') => {
        const file = fileFor[loc.type];
        if (!file) return;

        const res = await fetch(`${DATA_BASE_URL}/${reportRegion}/${file}`, {
            headers: { Range: `bytes=${loc.byteStart}-${loc.byteEnd}` },
        });
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
        selectStop({
            type: p.type,
            byteStart: p.byteStart,
            byteEnd: p.byteEnd,
            lon, lat,
            subcategory: p.subcategory,
        }, 'map-click');
    }, [selectStop]);

    const handlePreviewSelect = useCallback((_name: string, feature?: any) => {
        if (!feature) return;
        updateSelection({ feature, datasetName: 'preview', reportRegion, idTags }, 'map-click');
    }, [reportRegion, idTags, updateSelection]);

    // Load preview.geojson lazily when the preview toggle is on.
    useEffect(() => {
        if (selectedDatasets['preview'] && !previewData) {
            fetch(`${DATA_BASE_URL}/${reportRegion}/preview.geojson`)
                .then(r => r.json())
                .then(setPreviewData);
        }
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

        selectStop({
            type: row.type,
            byteStart: row.byteStart,
            byteEnd: row.byteEnd,
            lon: row.lon,
            lat: row.lat,
            subcategory: row.code,
        }, 'url-hash');
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

    const selectedCodes = CATEGORY_CODES.filter(c => selectedDatasets[c]);

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

    const previewControl = (
        <div className={'match-group'} key={'preview'}>
            <div className={'match-group-header'}>
                <input className={'match-dataset-select'} type={'checkbox'} checked={!!selectedDatasets['preview']}
                    onChange={e => updateSelectedDatasets({ ...selectedDatasets, preview: (e.target as HTMLInputElement).checked })} />
                <span className={'match-dataset'} title={'Preview timetables for all matched'}>Preview</span>
            </div>
        </div>
    );

    const stopsLayer = rows.length > 0 &&
        <StopsLayer key={reportRegion} layerKey={reportRegion} data={featureCollection}
            selectedCodes={selectedCodes} onClick={handleStopClick} />;

    const previewLayer = selectedDatasets['preview'] && previewData &&
        <DatasetMapLayer key={`${reportRegion}:preview`} name={'preview'} color={PREVIEW_COLOR}
            data={previewData} onClick={handlePreviewSelect} />;

    const gtfsTS = new Date(matchMeta.gtfsTimeStamp).toUTCString();
    const osmSourcesTS = matchMeta.coveredPbfSources.map(({ path, fileTimestamp }) => {
        return <div>
            <label>{path} </label><div className={"ts-value"}>{new Date(fileTimestamp).toUTCString()}</div>
        </div>
    });

    return (<div>
        <h2 className={"report-header"}>{reportRegion}</h2>
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

type DatasetMapLayerProps = {
    name: string
    color: string
    data: GeojsonDataT
    onClick?: (datasetName: string, feature?: MapGeoJSONFeature, e?: MapLayerClickEvent) => void
}
// Used only for the preview overlay (preview.geojson), which is unchanged by the
// index/NDJSON migration.
function DatasetMapLayer({ name, color, data, onClick }: DatasetMapLayerProps) {

    const mapContext = useContext(MapContext);
    const map = mapContext?.map;
    const mapLoaded = mapContext?.loaded;
    const stylingControls = mapContext?.layerControls;

    useEffect(() => {
        if (!map || !stylingControls) return;

        const sourceId = `stops-${name}`;
        const layerId = `stops-${name}`;

        const stopsLayer = {
            'id': layerId,
            'type': 'symbol',
            'source': sourceId,
            'layout': {
                'icon-image': `stop-${name}`,
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
            onClick && onClick(name, e.features?.[0], e);
        }

        const iconImageId = `stop-${name}`;
        const imageColors = {
            ".stroke-fg": ["stroke", color] as [string, string],
            ".fill-fg": ["fill", color] as [string, string],
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

    }, [map, stylingControls, name, data]);

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
