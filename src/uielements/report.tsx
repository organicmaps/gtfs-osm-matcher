import { useCallback, useContext, useEffect, useState } from "preact/hooks";
import { MapContext, SelectionContext } from "../app";
import { loadSvgWithColors } from "../map/map";
import type { GeoJSONFeature, MapGeoJSONFeature, MapMouseEvent } from "maplibre-gl";

import "./report.css"
import { parseDsAndId, useHash } from "./routing";
import { DATA_BASE_URL } from "../config";

var shouldUpdateBoundsSignal = {
    value: false
};

window.addEventListener('ShouldUpdateBounds',
    () => shouldUpdateBoundsSignal.value = true
);

const palette = {
    'preview': '#2c2ca5ff',
    'match-id': 'green',
    'match-name': 'green',
    'separated-clusters': '#467d18',
    'many-to-one': '#93cf32ff',
    'transit-hub-clusters': '#b5b20bff',
    'clusters': '#80520e',
    'no-match': 'red',
    'no-osm-stops': 'black',
}

export const datasetKeys = [
    'preview',
    'match-id',
    'match-name',
    'separated-clusters',
    'transit-hub-clusters',
    'many-to-one',
    'clusters',
    'no-match',
    'no-osm-stops',
];

type DatatsetsSelectonT = {
    [key: string]: boolean
}
const defaultSets = { 'no-match': true } as DatatsetsSelectonT;

type MatchDataset = {
    name: string
    featuresCount: number
}

const matchDatasetSortOrder = [
    'preview',
    'match-id',
    'match-name',
    'match-name-id-conflict',
    'separated-clusters',
    'transit-hub-clusters',
    'many-to-one',
    'clusters',
    'match-generic',
    'no-match',
    'no-osm-stops',
];

const dsTitles: {[key: string]: string} = {
    'preview': 'Preview timetables for all matched',
    'match-id': 'Stops matched by GTFS Id or Code',
    'match-name': 'Stops matched by Name',
    'match-name-id-conflict': 'Stops matched by Name but mismatched by id',
    'separated-clusters': 'Many OSM stops matched one or many GTFS, but successfuly separated',
    'transit-hub-clusters': 'Many OSM platforms or stops matched to one Station by name',
    'many-to-one': 'Many OSM stops matched exactly one GTFS by name',
    'clusters': 'Many OSM stops matched one or many GTFS by name',
    'match-generic': 'Matched to a stop without name or code nearby',
    'no-match': 'No osm element matched',
    'no-osm-stops': 'No OSM elemnts of matching transport mode found in the area',
};

const matchDatasetOrderComparator = (a: MatchDataset, b: MatchDataset) => {
    const aInx = matchDatasetSortOrder.indexOf(a.name);
    const bInx = matchDatasetSortOrder.indexOf(b.name);
    
    const aCmp = aInx < 0 ? 100: aInx;
    const bCmp = bInx < 0 ? 100: bInx;

    return aCmp - bCmp;
}

export type Report = {
    region: string;

    matchDatasets: MatchDataset[];

    idTags: {
        [key: string]: number
    };

    matchStats: {
        total: number;
        matchId: number;
        nameMatch: number;
        manyToOne: number;
        transitHubs: number;
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

type GeojsonDataT = {
    features: GeojsonFeatureT[]
    [key: string]: any
};

type GeojsonFeatureT = {
    properties: {
        [key: string]: any
    }
    [key: string]: any
}

type DatasetsDataByName = {
    [name: string]: GeojsonDataT
}

type MatchReportProps = {
    reportRegion: string;
    reportData: Report;
}
export function MatchReport({ reportRegion, reportData }: MatchReportProps) {
    const { selection, selectionSource, updateSelection } = useContext(SelectionContext);
    const map = useContext(MapContext)?.map;

    const hashSelection = parseDsAndId(useHash(), datasetKeys);
    const matchMeta = reportData.matchMeta;
    const idTags = reportData.idTags;

    console.log('hashSelection', hashSelection);
    console.log('reportData', reportData);

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

    const urlSelectedSet = hashSelection?.dataset ? { [hashSelection?.dataset]: true } : undefined;
    const [selectedDatasets, updateSelectedDatasets] = useState(urlSelectedSet || defaultSets);
    const [datasetData, updateDatasetData] = useState<DatasetsDataByName>({});

    const handleDatasetLoad = useCallback((ds: string, data: any) => {
        console.log('Loaded', reportRegion, ds);
        updateDatasetData({
            ...datasetData,
            [ds]: data
        });

        // TODO: Factor out into separate callback
        if (ds === hashSelection?.dataset && hashSelection.featureId) {
            const lookupId = hashSelection.featureId;

            if (selection?.feature.properties.gtfsStopId === lookupId ||
                (selection?.feature.properties.gtfsFeatures as { id: string }[])?.some(({ id }) => lookupId === id)) {
                // Same feature is already selected
                return;
            }

            const found = data.features.find((f: any) => {
                const feature = f as GeoJSONFeature;

                if (lookupId === feature.properties.gtfsStopId || lookupId === feature.properties.id) {
                    return true;
                }

                if ((feature.properties.gtfsFeatures as { id: string }[])?.some(({ id }) => lookupId === id)) {
                    return true;
                }

                return false;

            });

            if (found) {
                updateSelection({
                    feature: stringifyProperties(found),
                    datasetName: ds,
                    idTags,
                    reportRegion,
                    reportData
                }, 'url-hash');
            }
        }
    }, [reportRegion, idTags, datasetData, updateDatasetData, hashSelection, selection, updateSelection]);

    useEffect(() => {
        if (map && selectionSource === 'url-hash' && selection) {
            const lonlat = (selection.feature.geometry as { coordinates: number[] } & any)?.coordinates;
            console.log('about to fly to', selection?.feature);
            map.flyTo({center: lonlat, zoom: 18, duration: 1});
        }
    }, [map, selection, selectionSource]);

    useEffect(() => {
        if (reportRegion) {
            Object.keys(selectedDatasets).filter(ds => selectedDatasets[ds as keyof typeof selectedDatasets]).forEach((ds) => {
                if (!datasetData[ds]) {
                    console.log('Loading', reportRegion, ds);
                    fetch(`${DATA_BASE_URL}/${reportRegion}/${ds}.geojson`)
                        .then(r => r.json())
                        .then(data => {
                            handleDatasetLoad(ds, data);
                        });
                }
            });
        }
    }, [reportRegion, selectedDatasets, datasetData, updateDatasetData, handleDatasetLoad]);

    const datasetControls = reportData?.matchDatasets
        ?.sort(matchDatasetOrderComparator)
        ?.map(({ name: dsName, featuresCount }) => {
            const title = dsTitles[dsName];
            return (<div key={dsName}>
                <input className={'match-dataset-select'} type={"checkbox"} checked={selectedDatasets[dsName]} onChange={(e) => {
                    updateSelectedDatasets({ ...selectedDatasets, [dsName]: (e.target as HTMLInputElement).checked });
                }} />
                <span className={'match-dataset'} title={title} >{dsName}</span>
                <span className={'match-dataset-count'}>{featuresCount}</span>
            </div>)
        });

    const handleSelect = useCallback((datasetName: string, feature: any) => {
        updateSelection({ feature, datasetName, reportRegion, idTags }, 'map-click');
    }, [reportRegion, updateSelection, idTags]);

    const datasetElements = Object.entries(datasetData)
        .filter(([name]) => selectedDatasets[name])
        .map(([name, data]) =>
            <DatasetMapLayer key={`${reportRegion}:${name}`} name={name} data={data as GeojsonDataT} onClick={handleSelect} />
        );

    const gtfsTS = new Date(matchMeta.gtfsTimeStamp).toUTCString();
    const osmSourcesTS = matchMeta.coveredPbfSources.map(({ path, fileTimestamp }) => {
        return <div>
            <label>{path} </label><div className={"ts-value"}>{new Date(fileTimestamp).toUTCString()}</div>
        </div>
    });

    return (<div>
        <h2>{reportRegion}</h2>
        {datasetControls}
        {datasetElements}
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

type DatasetMapLayerProps = {
    name: string
    data: GeojsonDataT
    onClick?: (datasetName: string, feature?: MapGeoJSONFeature, e?: MapLayerClickEvent) => void
}
function DatasetMapLayer({ name, data, onClick }: DatasetMapLayerProps) {

    const mapContext = useContext(MapContext);
    const map = mapContext?.map;
    const mapLoaded = mapContext?.loaded;
    const stylingControls = mapContext?.layerControls;

    console.log('Render dataset layer', name);

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
                // 'icon-overlap': 'always'
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
            ".stroke-fg": ["stroke", palette[name as keyof typeof palette]] as [string, string],
            ".fill-fg": ["fill", palette[name as keyof typeof palette]] as [string, string],
        };

        const subscription = {
            canceled: false,
            promiseFulfiled: false
        };

        const iconPromise = map.hasImage(iconImageId) ? null :
            loadSvgWithColors("/stop-var.svg", imageColors);

        mapLoaded?.then(async map => {
            console.log('Map loaded', name);

            if (iconPromise && !map.hasImage(iconImageId)) {
                const image = await iconPromise;
                if (!map.hasImage(iconImageId)) {
                    map.addImage(iconImageId, image);
                }
            }

            subscription.promiseFulfiled = true;
            if (!subscription.canceled) {
                console.log('Add stylingControls overlay', name);
                // @ts-ignore
                stylingControls.addOverlayImmediate(stopsStyle);
                if (onClick) {
                    map.on('click', layerId, handleClick);
                }
            }
            else {
                console.log('Skipping adding map layer', name);
            }
        });

        return () => {
            console.log('Remove map layer', name);

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

function stringifyProperties(f: GeoJSONFeature) {
    const properties = Object.fromEntries(Object.entries(f.properties).map(([k, v]) => {
        if (Array.isArray(v) || typeof v === 'object') {
            return [k, JSON.stringify(v)];
        }

        return [k, v]
    }));

    return {
        ...f,
        properties
    } as MapGeoJSONFeature;
}


// function PopupContent({data_set, match_data}) {

//     const props = Object.entries(match_data).map(([k, v]) => h('div', {}, 
//         h('div', {}, k), 
//         h('div', {}, JSON.stringify(v))
//     ));

//     return h('div', {}, props)
// }
