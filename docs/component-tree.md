# Component Tree

```
App  (src/app.tsx)
└── [MapContext + SelectionContext + OsmMatchesOptionsContext providers]
    └── #content-area
        ├── #side-panel
        │   ├── SidePanelNav  (inline in app.tsx)
        │   │   └── [tabs: All reports | Report | Routes | Selection | OSM Changes | Minimize/Restore]
        │   │       subscribes to OSM_DATA for anyOsmChanges
        │   │
        │   ├── [tab: selection]
        │   │   └── SelectionInfo  (src/uielements/selection-info.tsx)
        │   │       ├── OsmMatchesSwitch  (src/uielements/switch.tsx)  [anchored positions; shares OsmMatchesOptionsContext with MatchReport]
        │   │       └── MatchInfo  [per selected feature]
        │   │           ├── DatasetHelp
        │   │           ├── MatchArrowLayer  (src/uielements/match-arrow.tsx)  [GTFS→OSM arrows on map, matched categories only]
        │   │           ├── HtmlMapMarker  (src/uielements/editor/map-marker.tsx)  [per GTFS feature, clusters only]
        │   │           ├── RouteList  (src/uielements/route-list.tsx)  [route pills + variants]
        │   │           │   ├── RouteMatchStatus  (src/uielements/route-match-status.tsx)  [relation coverage and stop matching totals]
        │   │           │   └── RoutesMap  (src/uielements/routes.tsx)  [setData into persistent 'routes' map source]
        │   │           ├── AddOsmStopController  (src/uielements/editor/add-stop-controller.tsx)
        │   │           └── OsmElements  [matched + new + surrounding (Overpass, <500 m) elements]
        │   │               ├── OsmListElement  [per OSM element]
        │   │               │   ├── TagsTable  [view mode]
        │   │               │   └── TagEditor  (src/uielements/editor/osm-tags.tsx)  [edit mode]
        │   │               │       └── [Set Name | Set Id | Set Code | MoveController (editor/move-stop-controller.tsx)]
        │   │               └── HtmlMapMarker  [per OSM / Overpass element]
        │   │
        │   ├── [tab: report]  (always mounted to keep map layers active)
        │   │   └── MatchReportSelector  (src/uielements/report-selector.tsx)
        │   │       ├── RegionMarkersLayer  [when no report selected — region circles/bboxes on map]
        │   │       ├── ReportTable  [when no report selected]  (src/uielements/report-table.tsx)
        │   │       └── MatchReport  [when report region in URL hash]  (src/uielements/report.tsx)
        │   │           ├── OsmMatchesSwitch  (src/uielements/switch.tsx)  [shared with SelectionInfo]
        │   │           ├── UnassignedOsmLayer  [osm-index-stops.tsv.gz; its own dataset checkbox, independent of the anchor switch]
        │   │           └── StopsLayer  [all index.tsv stops in one symbol layer; sub-categories toggled via
        │   │               map.setFilter, geometry swapped via setData when the osm-matches view
        │   │               draws them at their anchored positions]
        │   │
        │   ├── [tab: routes]
        │   │   └── RoutesTab  (src/uielements/routes-tab.tsx)  [fixed header with metadata/filters; independently scrollable route list]
        │   │       ├── [route index, separate relation + stop status filters, transport-mode filters, ranked search, lazy variant details, per-route fly-to, route deep-link restore]
        │   │       ├── RouteInfo  (src/uielements/route-info.tsx)  [selected route metadata, anchor totals and selected variant's matched stop OSM links]
        │   │       │   └── RouteMatchStatus  [relation coverage and stop matching totals]
        │   │       ├── RouteListItem  (src/uielements/route-list-item.tsx)  [route row and lazy variants]
        │   │       │   └── RouteMatchStatus
        │   │       ├── RoutesMap  [selected GTFS route/variant and matched OSM relation ways]
        │   │       └── getOsmRouteGeometry  (src/services/osmRouteGeometry.ts)  [Overpass, cached per relation]
        │   │
        │   └── [tab: changes]
        │       └── Changes  (src/uielements/editor/changes.tsx)
        │
        └── #map-container
            ├── MapTools  (src/uielements/map-tools.tsx)  [floating panel, top-right of map]
            │   ├── map-tools-toggle  ◀/▶ fold button
            │   ├── [map-tools-content: Help | Sat/Geo | PT structure | Location input + Goto OSM]
            │   └── ReportHelpOverlay  [conditional: showHelp, portals into document.body]
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

The Routes tab constrains the panel to its available height: navigation stays above the tab,
`.routes-tab-header` holds status, selected route info and filters, and `.routes-tab-list`
scrolls within the remaining space. Top/bottom overlay buttons return to the active variant (or route header) when it is outside the visible list; filtering it out hides the buttons. The header scrolls only when its content exceeds 60%
of the tab height, keeping the list accessible on short screens or with expanded stop IDs.

### Side panel minimize behaviour
- Minimized state is tracked via `minimized-panel` CSS class on `#content-area` (no React state)
- Desktop: `#side-panel` becomes `position: absolute`, floats top-left over the map; map fills full width
- Mobile: `#side-panel` shrinks to nav bar height only

## Contexts

| Context | Provider | Consumers |
|---|---|---|
| `MapContext` | `App` | `MatchReport`, `StopsLayer`, `RegionMarkersLayer`, `RoutesMap`, `MatchArrowLayer`, `HtmlMapMarker`, `LocateMe`, `AddOsmStopController`, `MoveController` |
| `SelectionContext` | `App` | `MatchReport`, `SelectionInfo`, `OsmListElement` |
| `OsmMatchesOptionsContext` | `App` | `MatchReport` (publishes `osmMatchesAvailable`), `OsmMatchesSwitch` (hidden when unavailable) |

## OSMData event system

`OSM_DATA` (singleton `OSMData` instance) exposes `subscribe(fn) → unsubscribe` backed by a `Set` of listeners. Used with `useSyncExternalStore` in `SelectionInfo` (element list) and `SidePanelNav` (anyOsmChanges badge).
