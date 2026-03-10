# Component Tree

```
App  (src/app.tsx)
├── AppHeader  (src/uielements/app-header.tsx)
│   ├── ReportHelpOverlay  [conditional: showHelp]
│   └── Changes  [conditional: showChanges, inside .overlay modal]
│
└── [MapContext + SelectionContext providers]
    └── #side-panel
        ├── MatchReportSelector  (src/uielements/report-selector.tsx)
        │   ├── ReportTable  [when no report selected in URL hash]
        │   │   └── renderReportRow()  [per report row]
        │   │
        │   └── MatchReport  [when report region in URL hash]  (src/uielements/report.tsx)
        │       └── DatasetMapLayer  [per loaded dataset, renders into map via MapContext]
        │
        ├── SchedulePreview  [conditional: selection.datasetName === 'preview']
        │   (src/uielements/schedule-preview.tsx)
        │
        └── SelectionInfo  [conditional: selection present, not preview]
            (src/uielements/selection-info.tsx)
            ├── MatchInfo  [per selected feature]
            │   ├── RoutesMap  (src/uielements/routes.tsx)
            │   ├── OsmElements
            │   │   └── OsmListElement  [per OSM element]
            │   │       └── TagsTable
            │   ├── TagEditor  (src/uielements/editor/osm-tags.tsx)
            │   └── DatasetHelp
            ├── HtmlMapMarker  (src/uielements/editor/map-marker.tsx)
            ├── AddOsmStopController  (src/uielements/editor/add-stop-controller.tsx)
            └── MoveController  (src/uielements/editor/move-stop-controller.tsx)
```

## Layout structure

```
#app  (flex column)
├── #app-header
└── #content-area  (flex row desktop / flex column mobile)
    ├── #side-panel  (.slim when report selected)
    │   ├── MatchReportSelector
    │   └── SelectionInfo | SchedulePreview
    └── #map-container
        └── #map-view  (MapLibre GL canvas)
```

## Contexts

| Context | Provider | Consumers |
|---|---|---|
| `MapContext` | `App` | `MatchReport`, `DatasetMapLayer`, `RoutesMap`, `SelectionInfo` |
| `SelectionContext` | `App` | `MatchReportSelector`, `MatchReport` |
