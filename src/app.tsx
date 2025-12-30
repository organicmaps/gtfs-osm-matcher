import { createContext } from 'preact';

import type { Map, MapGeoJSONFeature } from 'maplibre-gl';
import type { LayerControls } from './map/layers-controls';

import './app.css'
import { createMap } from './map/map';
import { useCallback, useEffect, useState } from 'preact/hooks';
import { MatchReportSelector } from './uielements/report-selector';
import { SelectionInfo } from './uielements/selection-info';
import { SchedulePreview } from './uielements/schedule-preview';
import type { Report } from './uielements/report';

export type MapContextT = {
  map: Map,
  loaded: Promise<Map>,
  layerControls: LayerControls
}

export const MapContext = createContext<MapContextT | undefined>(undefined);

export type SelectionT = {
  feature: MapGeoJSONFeature,
  datasetName?: string,
  reportRegion?: string,
  [k: string]: any
}

export const SelectionContext = createContext<[selection: SelectionT | null, updateSelection: (newSelection: SelectionT) => void]>([null, () => { }]);

export const MatchReportContext = createContext<Report | null>(null);

export function App() {

  const [mapContextVal, setMapContextVal] = useState<MapContextT>();
  const [selection, updateSelection] = useState<SelectionT | null>(null);
  const [reportData, updateReportData] = useState<Report | null>(null);

  useEffect(() => {
    setMapContextVal(createMap("map-view"));
  }, []);

  useEffect(() => {
    const reportRegion = selection?.reportRegion;
    const datasetName = selection?.datasetName;

    const clusterGtfsFeaturesStr = selection?.feature.properties?.gtfsFeatures;
    const clusterGtfsFeatures = clusterGtfsFeaturesStr && JSON.parse(clusterGtfsFeaturesStr);

    const id = selection?.feature.properties.gtfsStopId || clusterGtfsFeatures?.[0].id || selection?.feature.properties.id;

    if (reportRegion) {
      var hash = `#/match-report/${reportRegion}`;

      if (datasetName && id) {
        hash += `/selection/${datasetName}/${id}`;
      }

      window.location.hash = hash;
    }
  }, [selection]);

  useEffect(() => {
    window.addEventListener('SelectingReports',
      () => updateSelection(null)
    );
  }, [updateSelection]);

  const handleReportChange = useCallback((report: Report | null) => {
    updateReportData(report);
  }, [updateReportData]);

  const preview = selection?.datasetName === 'preview';

  return (
    <>
      <div id="map-view"></div>
      <button id="map-style-button">Map Style</button>
      <MapContext value={mapContextVal} >
        <SelectionContext value={[selection, updateSelection]} >
          <MatchReportContext value={reportData} >

            <MatchReportSelector updateReportData={handleReportChange} />
            {preview ?
              <SchedulePreview selection={selection} /> :
              <SelectionInfo selection={selection} />
            }

          </MatchReportContext>
        </SelectionContext>
      </MapContext>
    </>
  )
}
