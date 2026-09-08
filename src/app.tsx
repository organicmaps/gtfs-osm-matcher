import { createContext } from 'preact';

import type { Map, MapGeoJSONFeature } from 'maplibre-gl';
import type { LayerControls } from './map/layers-controls';

import './app.css'
import { createMap } from './map/map';
import { useEffect, useMemo, useState } from 'preact/hooks';
import { MatchReportSelector } from './uielements/report-selector';
import { SelectionInfo } from './uielements/selection-info';
import { MapTools } from './uielements/map-tools';
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
      {(reportRegion || anyOsmChanges) && <>
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

/**
 * View options the report and the selection panel both need. They are siblings under App —
 * the report renders in the report tab and the panel in the selection tab — so a control
 * wanted in both cannot own its state in either.
 */
export type ViewOptionsT = {
  previewOn: boolean;
  setPreviewOn: (on: boolean) => void;
  /**
   * Whether the loaded report has anything to preview. Published by the report, because only
   * it has read the index; consumed by the switch, which is rendered in two places and must
   * not offer a control that would immediately turn itself off.
   */
  previewAvailable: boolean;
  setPreviewAvailable: (available: boolean) => void;
};

export const ViewOptionsContext = createContext<ViewOptionsT>({
  previewOn: false,
  setPreviewOn: () => { },
  previewAvailable: false,
  setPreviewAvailable: () => { }
});

export function App() {
  const [activeTab, setActiveTab] = useState<'report' | 'selection' | 'changes'>('report');
  const [mapContextVal, setMapContextVal] = useState<MapContextT>();
  const [selection, updateSelection] = useState<SelectionT | null>(null);
  const [selectionSource, updateSelectionSource] = useState<SelectionSourceT>('app-init');
  // Shared with the selection panel, which is the report's sibling rather than its child.
  const [previewOn, setPreviewOn] = useState(false);
  const [previewAvailable, setPreviewAvailable] = useState(false);

  // A region with no anchors, or the report list, leaves nothing to preview -- and the switch
  // outlives both, so it is cleared here rather than by whichever component noticed.
  useEffect(() => {
    if (!previewAvailable && previewOn) setPreviewOn(false);
  }, [previewAvailable, previewOn]);

  // Memoised: a fresh object here force-renders every consumer on every App render, and
  // both consumers are whole panels.
  const viewOptions = useMemo(
    () => ({ previewOn, setPreviewOn, previewAvailable, setPreviewAvailable }),
    [previewOn, previewAvailable]);

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

    const clusterGtfsFeaturesStr = selection?.feature.properties?.gtfsFeatures;
    const clusterGtfsFeatures = clusterGtfsFeaturesStr && JSON.parse(clusterGtfsFeaturesStr);

    const id = selection?.feature.properties.gtfsStopId || clusterGtfsFeatures?.[0].id || selection?.feature.properties.id;

    if (reportRegion) {
      var hash = `#/match-report/${reportRegion}`;

      if (id) {
        // GTFS ids are free-form UTF-8 and do occur with spaces, '#' or '/': a '#'
        // truncates the hash and parseSelectionHash's [^/]+ cuts at a slash.
        const encoded = encodeURIComponent(id);
        hash += `/selection/${encoded}`;
      }

      window.location.hash = hash;
    }
  }, [selection]);


  const reportRegion = useHashRoute(parseUrlReportRegion);

  return (
    <>
      <MapContext value={mapContextVal} >
        <SelectionContext value={selectionContext} >
          <ViewOptionsContext value={viewOptions} >
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
                  <SelectionInfo selection={selection} />
                </div>

                <div className={cls(activeTab !== 'report' && 'tab-hidden')}>
                  <MatchReportSelector onSelectReport={selectionContext.onReportSelect} />
                </div>

                <div className={cls(activeTab !== 'changes' && 'tab-hidden')}>
                  <Changes osmData={OSM_DATA} />
                </div>

              </div>
              <div id="map-container">
                <MapTools />
                <div id="map-view"></div>
              </div>
            </div>
          </ViewOptionsContext>
        </SelectionContext>
      </MapContext>
    </>
  )
}
