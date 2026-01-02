import { useContext, useEffect, useState } from "preact/hooks";
import { MapContext } from "../app";
import type { GeoJSONSource } from "maplibre-gl";

type RoutesProps = {
    routes: { [k: string]: { nextStopLonLat: number[], prevStopLonLat: number[] } };
    stopLonLat: number[],
    gtfsRouteTypes: string
}
export function Routes({ routes, stopLonLat, gtfsRouteTypes }: RoutesProps) {

    if (import.meta.env.DEV) {
        console.log('Render routes', routes);
    }

    const map = useContext(MapContext)?.map;
    const layerControls = useContext(MapContext)?.layerControls;

    const [mapStylesReady, setMapStylesReady] = useState<boolean>(!!map?.getSource('routes'));

    const features = Object.entries(routes || {}).map(([routeKey, route]) => {

        const { nextStopLonLat, prevStopLonLat } = route;

        const features = [];

        if (nextStopLonLat) {
            features.push({
                type: 'Feature',
                geometry: {
                    type: 'LineString',
                    coordinates: [
                        [...stopLonLat],
                        [...nextStopLonLat]
                    ]
                },
                properties: {
                    name: routeKey,
                    color: 'red'
                }
            });
        }

        if (prevStopLonLat) {
            // const m = new Marker().setLngLat({ lat: prevStopLonLat[1], lng: prevStopLonLat[0] }).addTo(map);
            // m.getElement().innerText = 'prev';

            features.push({
                type: 'Feature',
                geometry: {
                    type: 'LineString',
                    coordinates: [
                        [...prevStopLonLat],
                        [...stopLonLat],
                    ]
                },
                properties: {
                    name: routeKey,
                    color: 'blue'
                }
            });
        }

        return features;
    });

    useEffect(() => {
        if (!map) return;

        if (!map.hasImage('route-arrow')) {
            const img = new Image();
            img.onload = function () {
                map.addImage('route-arrow', img);
            }
            img.src = 'arrow.svg';
        }

        const createRouteLayers = () => {
            console.log('Create routes map styles');


            if (!map.getSource('routes')) {
                layerControls?.addOverlayImmediate({
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
                });
            }

            // if (!map.getLayer('routes-arrow')) {
            //     map.addLayer({
            //         id: 'routes-arrow',
            //         type: 'symbol',
            //         source: 'routes',
            //         layout: {
            //             'symbol-placement': 'line',
            //             'symbol-spacing': 45,
            //             'icon-allow-overlap': true,
            //             'icon-image': 'route-arrow',
            //             'icon-size': 0.6,
            //         }
            //     });
            // }

            // if (!map.getLayer('route-names')) {
            //     map.addLayer({
            //         id: 'route-names',
            //         type: 'symbol',
            //         source: 'routes',
            //         layout: {
            //             'text-field': ['get', 'name'],
            //             "symbol-placement": "line",
            //             "symbol-spacing": 95,
            //             "text-font": ["Noto Sans Regular"],
            //             'text-size': 10,
            //         },
            //         paint: {
            //             'text-color': 'black',
            //             'text-halo-color': 'white',
            //             'text-halo-width': 5,
            //         }
            //     });
            // }

            setMapStylesReady(true);
        };

        if (map.loaded()) {
            createRouteLayers();
        }
        else {
            map.once('load', createRouteLayers);
        }

    }, [map, layerControls, setMapStylesReady]);

    useEffect(() => {
        if (!mapStylesReady) {
            return;
        }

        if (!map || !routes) {
            import.meta.env.DEV &&
                console.warn('Routes: map or routes is not ready');

            return;
        }

        if (map.getSource('routes')) {
            (map.getSource('routes') as GeoJSONSource).setData({
                type: 'FeatureCollection',
                // @ts-ignore
                features: features.flat()
            });
        }
        else {
            console.warn('Map source routes not ready');
        }

        return () => {
            if (map.getSource('routes')) {
                (map.getSource('routes') as GeoJSONSource).setData({
                    type: 'FeatureCollection',
                    features: []
                });
            }
        };

    }, [map, features, mapStylesReady]);

    return <div>
        Gtfs route types: <b>{gtfsRouteTypes}</b>
        {routes && <div><b>Routes: </b>
            {Object.entries(routes || {}).map(([routeId, _route]) =>
                <span key={routeId}>{routeId} </span>
            )}
        </div>}
    </div>
}