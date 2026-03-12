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
import { parseUrlReportRegion, useHashRoute } from './uielements/routing';
import { cls } from './uielements/cls';

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

export type SelectionSourceT = 'map-click' | 'report-reset' | 'app-init' | 'url-hash';

export type SelectionContextT = {
  selection: SelectionT | null;
  selectionSource: SelectionSourceT;
  updateSelection: (newSelection: SelectionT, eventSource: SelectionSourceT) => void;
  onReportSelect: (reportRegion: string | null) => void;
};

type SidePanelNavProps = {
  reportRegion: string | undefined;
  selection: SelectionT | null;
  activeTab: 'report' | 'selection';
  setActiveTab: (tab: 'report' | 'selection') => void;
  minimized: boolean;
  setMinimized: (v: boolean) => void;
  onBackToReports: () => void;
}

function SidePanelNav({ reportRegion, selection, activeTab, setActiveTab, minimized, setMinimized, onBackToReports }: SidePanelNavProps) {
  return (
    <div className={'report-nav'}>
      {reportRegion && <>
        <a className={'no-decoration'} onClick={onBackToReports} href="#/">All reports</a>
        <span className={'tab-sep'}>|</span>
      </>}
      {reportRegion && <>
        <span className={cls('tab', activeTab === 'report' && 'tab-active')}
          onClick={() => setActiveTab('report')}>Report</span>
        <span className={'tab-sep'}>|</span>
      </>}
      {selection && <>
        <span className={cls('tab', activeTab === 'selection' && 'tab-active')}
          onClick={() => setActiveTab('selection')}>Selection</span>
        <span className={'tab-sep'}>|</span>
      </>}
      <span className={'minimize-toggle'}
        title={minimized ? 'maximize' : 'minimize'}
        onClick={() => setMinimized(!minimized)}
      >
        {minimized ? <span>Restore</span> : <span>Minimize</span>}
      </span>
    </div>
  );
}

export const SelectionContext = createContext<SelectionContextT>({
  selection: null,
  selectionSource: 'app-init',
  onReportSelect: () => { },
  updateSelection: () => { }
});

export function App() {
  const [minimized, setMinimized] = useState(false);
  const [activeTab, setActiveTab] = useState<'report' | 'selection'>('report');
  const [mapContextVal, setMapContextVal] = useState<MapContextT>();
  const [selection, updateSelection] = useState<SelectionT | null>(null);
  const [selectionSource, updateSelectionSource] = useState<SelectionSourceT>('app-init');

  const selectionContext: SelectionContextT = {
    selection,
    updateSelection: (selection, source) => {
      updateSelection(selection);
      updateSelectionSource(source);
      setActiveTab('selection');
    },
    selectionSource,
    onReportSelect: (_r: string | null) => {
      updateSelection(null);
      updateSelectionSource('report-reset');
      setActiveTab('report');
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
  const reportRegion = useHashRoute(parseUrlReportRegion);

  return (
    <>
      <AppHeader />
      <MapContext value={mapContextVal} >
        <SelectionContext value={selectionContext} >
          <div id="content-area">
            <div id="side-panel" className={cls(reportRegion && 'slim', minimized && 'minimized')}>
              <SidePanelNav
                reportRegion={reportRegion}
                selection={selection}
                activeTab={activeTab}
                setActiveTab={setActiveTab}
                minimized={minimized}
                setMinimized={setMinimized}
                onBackToReports={() => selectionContext.onReportSelect(null)}
              />
              {!minimized && <>
                <div className={cls(activeTab !== 'selection' && 'tab-hidden')}>
                  {preview ?
                    <SchedulePreview selection={selection} /> :
                    <SelectionInfo selection={selection} />
                  }
                </div>
                <div className={cls(activeTab !== 'report' && 'tab-hidden')}>
                  <MatchReportSelector onSelectReport={selectionContext.onReportSelect} />
                </div>
              </>}
            </div>
            <div id="map-container">
              <div id="map-view"></div>
            </div>
          </div>
        </SelectionContext>
      </MapContext>
    </>
  )
}
