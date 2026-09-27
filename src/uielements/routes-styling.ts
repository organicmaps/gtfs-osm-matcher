import type { OverlaySpecification } from "../map/layers-controls";

export const routesStyling: OverlaySpecification = {
    sources: {
        "routes": {
            type: 'geojson',
            data: {
                type: 'FeatureCollection',
                features: []
            }
        }
    },
    layers: [{
        id: 'routes',
        type: 'line',
        source: 'routes',
        layout: {
            'line-join': 'round',
            'line-cap': 'round',
            'line-sort-key': ['case', ['==', ['get', 'kind'], 'osm'], 0, 1],
        },
        paint: {
            'line-color': ['case', ['==', ['get', 'kind'], 'osm'], '#0876c7', 'red'],
            'line-width': ['case', ['==', ['get', 'kind'], 'osm'], 5, 2],
        }
    }, {
        id: 'routes-arrow',
        type: 'symbol',
        source: 'routes',
        filter: ['!=', ['get', 'kind'], 'osm'],
        layout: {
            'symbol-placement': 'line',
            'symbol-spacing': 45,
            'icon-allow-overlap': true,
            'icon-image': 'route-arrow',
            'icon-size': 0.6,
        }
    }, {
        id: 'route-names',
        type: 'symbol',
        source: 'routes',
        filter: ['!=', ['get', 'kind'], 'osm'],
        layout: {
            'text-field': ['get', 'name'],
            "symbol-placement": "line",
            "symbol-spacing": 95,
            "text-font": ["Noto Sans Regular"],
            'text-size': 10,
        },
        paint: {
            'text-color': 'black',
            'text-halo-color': 'white',
            'text-halo-width': 5,
        }
    }]
}
