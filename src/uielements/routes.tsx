import { useContext, useEffect } from "preact/hooks";
import { MapContext } from "../app";
import type { GeoJSONSource } from "maplibre-gl";

type RoutesProps = {
    routes: { [k: string]: { nextStopLonLat: number[], prevStopLonLat: number[] } };
    stopLonLat: number[],
    gtfsRouteTypes: string
}
export function Routes({ routes, stopLonLat, gtfsRouteTypes }: RoutesProps) {

    const map = useContext(MapContext)?.map;

    useEffect(() => {
        if (!map) return;

        console.log('Create routes map styles')

        map.once('load', () => {
            map.addSource('routes', {
                type: 'geojson',
                data: {
                    type: 'FeatureCollection',
                    features: []
                }
            });

            map.addLayer({
                id: 'routes',
                type: 'line',
                source: 'routes',
                layout: {
                    'line-join': 'round',
                    'line-cap': 'round',
                },
                paint: {
                    'line-color': 'red',
                    'line-width': 2,
                    'line-dasharray': [8, 3, 2, 6]
                }
            });

            map.addLayer({
                id: 'route-names',
                type: 'symbol',
                source: 'routes',
                layout: {
                    'text-field': ['get', 'name'],
                    "symbol-placement": "line",
                    "symbol-spacing": 75,
                    "text-font": ["Noto Sans Regular"],
                    'text-size': 12,
                },
                paint: {
                    'text-color': 'black',
                    'text-halo-color': 'white',
                    'text-halo-width': 5,
                }
            });
        });

        return () => {
            map.removeLayer('routes');
            map.removeLayer('route-names');
            if (map.getSource('routes')) {
                map.removeSource('routes');
            }
        };
    }, [map]);

    useEffect(() => {
        if (!map) return;
        if (!routes) return;

        const features = Object.entries(routes).map(([routeKey, route]) => {

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

        if (map.getSource('routes')) {
            (map.getSource('routes') as GeoJSONSource).setData({
                type: 'FeatureCollection',
                // @ts-ignore
                features: features.flat()
            });
        }

        return () => {
            if (map.getSource('routes')) {
                (map.getSource('routes') as GeoJSONSource).setData({
                    type: 'FeatureCollection',
                    features: []
                });
            }
        };

    }, [map, routes, stopLonLat]);

    return <div>
        Gtfs route types: <b>{gtfsRouteTypes}</b>
        {routes && <div>
            {Object.entries(routes).map(([routeId, route]) =>
                <span key={routeId}>{routeId} </span>
            )}
        </div>}
    </div>
}