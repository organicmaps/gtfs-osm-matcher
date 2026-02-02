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
        },
        paint: {
            'line-color': 'red',
            'line-width': 1,
        }
    }, {
        id: 'routes-arrow',
        type: 'symbol',
        source: 'routes',
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