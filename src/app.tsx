import { createContext } from 'preact';

import type { Map, MapGeoJSONFeature } from 'maplibre-gl';
import type { LayerControls } from './map/layers-controls';

import './app.css'
import { createMap } from './map/map';
import { useEffect, useState } from 'preact/hooks';
import { MatchReportSelector } from './uielements/report-selector';
import { SelectionInfo } from './uielements/selection-info';
import { SchedulePreview } from './uielements/schedule-preview';
import { AppHeader } from './uielements/app-header';

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
  idTags?: { [k: string]: number },
  [k: string]: any
}

export type SelectionContextT = {
  selection: SelectionT | null;
  updateSelection: (newSelection: SelectionT) => void;
  onReportSelect: (reportRegion: string | null) => void;
};

export const SelectionContext = createContext<SelectionContextT>({
  selection: null,
  onReportSelect: () => { },
  updateSelection: () => { }
});

export function App() {

  const [mapContextVal, setMapContextVal] = useState<MapContextT>();
  const [selection, updateSelection] = useState<SelectionT | null>(null);

  const selectionContext: SelectionContextT = {
    selection,
    updateSelection,
    onReportSelect: (_r: string | null) => {
      updateSelection(null);
      window.dispatchEvent(new Event('ShouldUpdateBounds'));
    }
  }

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


  const preview = selection?.datasetName === 'preview';

  return (
    <>
      <AppHeader />
      <div id="map-view"></div>

      <MapContext value={mapContextVal} >
        <SelectionContext value={selectionContext} >

          <MatchReportSelector onSelectReport={selectionContext.onReportSelect} />
          {preview ?
            <SchedulePreview selection={selection} /> :
            <SelectionInfo selection={selection} />
          }

        </SelectionContext>
      </MapContext>
    </>
  )
}
