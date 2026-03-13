# Component Tree

```
App  (src/app.tsx)
└── [MapContext + SelectionContext providers]
    └── #content-area
        ├── #side-panel
        │   ├── SidePanelNav  (inline in app.tsx)
        │   │   └── [tabs: All reports | Report | Selection | OSM Changes | Minimize/Restore]
        │   │       subscribes to OSM_DATA for anyOsmChanges
        │   │
        │   ├── [tab: selection]
        │   │   ├── SchedulePreview  [when selection.datasetName === 'preview']
        │   │   │   (src/uielements/schedule-preview.tsx)
        │   │   └── SelectionInfo  [otherwise]
        │   │       (src/uielements/selection-info.tsx)
        │   │       ├── MatchInfo  [per selected feature]
        │   │       │   ├── RoutesMap  (src/uielements/routes.tsx)
        │   │       │   ├── OsmElements
        │   │       │   │   └── OsmListElement  [per OSM element]
        │   │       │   │       └── TagsTable
        │   │       │   ├── TagEditor  (src/uielements/editor/osm-tags.tsx)
        │   │       │   └── DatasetHelp
        │   │       ├── HtmlMapMarker  (src/uielements/editor/map-marker.tsx)
        │   │       ├── AddOsmStopController  (src/uielements/editor/add-stop-controller.tsx)
        │   │       └── MoveController  (src/uielements/editor/move-stop-controller.tsx)
        │   │
        │   ├── [tab: report]  (always mounted to keep map layers active)
        │   │   └── MatchReportSelector  (src/uielements/report-selector.tsx)
        │   │       ├── RegionMarkersLayer  [when no report selected — region circles/bboxes on map]
        │   │       ├── ReportTable  [when no report selected]
        │   │       └── MatchReport  [when report region in URL hash]  (src/uielements/report.tsx)
        │   │           └── DatasetMapLayer  [per loaded dataset, renders into map via MapContext]
        │   │
        │   └── [tab: changes]
        │       └── Changes  (src/uielements/editor/changes.tsx)
        │
        └── #map-container
            ├── MapTools  (src/uielements/map-tools.tsx)  [floating panel, top-right of map]
            │   ├── map-tools-toggle  ◀/▶ fold button
            │   ├── [map-tools-content: Help | Map Style | Location input + Goto OSM]
            │   └── ReportHelpOverlay  [conditional: showHelp]
            └── #map-view  (MapLibre GL canvas)
```

## Layout structure

```
#app  (flex column)
└── #content-area  (flex row desktop / flex column mobile)
    │   [.minimized-panel on #content-area → side panel floats, map fills]
    ├── #side-panel  (.slim when report selected)
    │   ├── .report-nav  (SidePanelNav)
    │   └── tab content divs  (hidden via .tab-hidden)
    └── #map-container  (position: relative)
        ├── #map-tools  (position: absolute, top-right, foldable)
        └── #map-view  (MapLibre GL canvas, fills container)
```

### Side panel minimize behaviour
- Minimized state is tracked via `minimized-panel` CSS class on `#content-area` (no React state)
- Desktop: `#side-panel` becomes `position: absolute`, floats top-left over the map; map fills full width
- Mobile: `#side-panel` shrinks to nav bar height only

## Contexts

| Context | Provider | Consumers |
|---|---|---|
| `MapContext` | `App` | `MatchReport`, `DatasetMapLayer`, `RegionMarkersLayer`, `RoutesMap`, `SelectionInfo` |
| `SelectionContext` | `App` | `MatchReportSelector`, `MatchReport` |

## OSMData event system

`OSM_DATA` (singleton `OSMData` instance) exposes `subscribe(fn) → unsubscribe` backed by a `Set` of listeners. Used with `useSyncExternalStore` in `SelectionInfo` (element list) and `SidePanelNav` (anyOsmChanges badge).
