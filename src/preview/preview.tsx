import { useCallback, useEffect, useState } from 'preact/hooks';
import type { MapGeoJSONFeature } from 'maplibre-gl';

import '../app.css'
import './preview.css'
import { createMap } from '../map/map';
import { MapContext, type MapContextT, type SelectionT } from '../app';
import { SchedulePreview } from './schedule-preview';
import { DatasetMapLayer } from '../uielements/report';
import { DATA_BASE_URL } from '../config';
import { parseUrlPreviewStopId, useHashRoute } from '../uielements/routing';

type PreviewProps = {
    region: string;
}

export function Preview({ region }: PreviewProps) {
    const [mapContextVal, setMapContextVal] = useState<MapContextT>();
    const [selection, setSelection] = useState<SelectionT | null>(null);
    const [previewData, setPreviewData] = useState<any>(null);

    const hashStopId = useHashRoute(parseUrlPreviewStopId);

    useEffect(() => {
        setMapContextVal(createMap("map-view"));
    }, []);

    useEffect(() => {
        setPreviewData(null);
        fetch(`${DATA_BASE_URL}/${region}/preview.geojson`)
            .then(r => r.json())
            .then((data) => {
                setPreviewData(data);
                if (hashStopId) {
                    const found = data.features.find((f: any) =>
                        f.properties.id === hashStopId || f.properties.gtfsStopId === hashStopId
                    );
                    if (found) {
                        setSelection({ feature: found, datasetName: 'preview', reportRegion: region });
                    }
                }
            });
    }, [region]);

    useEffect(() => {
        const id = selection?.feature.properties.id ?? selection?.feature.properties.gtfsStopId;
        window.location.hash = id
            ? `#/preview/${region}/${id}`
            : `#/preview/${region}`;
    }, [selection, region]);

    const handleSelect = useCallback((_dsName: string, feature?: MapGeoJSONFeature) => {
        if (feature) {
            setSelection({ feature, datasetName: 'preview', reportRegion: region });
        }
    }, [region]);

    return (
        <MapContext value={mapContextVal}>
            <div id="content-area">
                <div id="side-panel" className="slim">
                    <div className="report-nav">
                        <a className="no-decoration" href={`#/match-report/${region}`}>← Report</a>
                        <span className="tab-sep">|</span>
                        <span>{region}</span>
                    </div>
                    {selection
                        ? <SchedulePreview selection={selection} />
                        : <div className="preview-hint">Click a stop on the map to see its schedule</div>
                    }
                </div>
                <div id="map-container">
                    <div id="map-view"></div>
                </div>
                {previewData &&
                    <DatasetMapLayer name="preview" data={previewData} onClick={handleSelect} />
                }
            </div>
        </MapContext>
    );
}
