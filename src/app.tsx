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
import { OSM_DATA } from './services/OSMData';
import { Changes } from './uielements/editor/changes';
import { useSyncExternalStore } from 'preact/compat';

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

const restorePanel = () =>
  document.getElementById('content-area')?.classList.remove('minimized-panel');
const togglePanel = () =>
  document.getElementById('content-area')?.classList.toggle('minimized-panel');

type SidePanelNavProps = {
  reportRegion: string | undefined;
  selection: SelectionT | null;
  activeTab: 'report' | 'selection' | 'changes';
  setActiveTab: (tab: 'report' | 'selection' | 'changes') => void;
  onBackToReports: () => void;
}

function SidePanelNav({ reportRegion, selection, activeTab, setActiveTab, onBackToReports }: SidePanelNavProps) {

  const anyOsmChanges = useSyncExternalStore<boolean>(
    (sub) => OSM_DATA.subscribe(sub), 
    () => OSM_DATA.listChanges().length > 0
  );

  return (
    <div className={'report-nav'}>
      {reportRegion && <>
        <a className={'no-decoration'} onClick={() => { restorePanel(); onBackToReports(); }} href="#/">All reports</a>
        <span className={'tab-sep'}>|</span>
      </>}
      {reportRegion && <>
        <span className={cls('tab', activeTab === 'report' && 'tab-active')}
          onClick={() => { restorePanel(); setActiveTab('report'); }}>Report</span>
        <span className={'tab-sep'}>|</span>
      </>}
      {selection && <>
        <span className={cls('tab', activeTab === 'selection' && 'tab-active')}
          onClick={() => { restorePanel(); setActiveTab('selection'); }}>Selection</span>
        <span className={'tab-sep'}>|</span>
      </>}
      {anyOsmChanges && <>
        <span className={cls('tab', activeTab === 'changes' && 'tab-active')}
          onClick={() => { restorePanel(); setActiveTab('changes'); }}>OSM Changes</span>
        <span className={'tab-sep'}>|</span>
      </>}
      <span className={'minimize-toggle'} onClick={togglePanel}>
        <span className={'label-minimize'}>Minimize</span>
        <span className={'label-restore'}>Restore</span>
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
  const [activeTab, setActiveTab] = useState<'report' | 'selection' | 'changes'>('report');
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
            <div id="side-panel" className={cls(reportRegion && 'slim')}>
              <SidePanelNav
                reportRegion={reportRegion}
                selection={selection}
                activeTab={activeTab}
                setActiveTab={setActiveTab}
                onBackToReports={() => selectionContext.onReportSelect(null)}
              />

              <div className={cls(activeTab !== 'selection' && 'tab-hidden')}>
                {preview ?
                  <SchedulePreview selection={selection} /> :
                  <SelectionInfo selection={selection} />
                }
              </div>

              <div className={cls(activeTab !== 'report' && 'tab-hidden')}>
                <MatchReportSelector onSelectReport={selectionContext.onReportSelect} />
              </div>

              <div className={cls(activeTab !== 'changes' && 'tab-hidden')}>
                <Changes osmData={OSM_DATA} />
              </div>

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
