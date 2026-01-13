import { useContext, useEffect, useState } from "preact/hooks";
import { MapContext } from "../app";
import { routesStyling } from "./routes-styling";
import type { GeoJSONSource } from "maplibre-gl";

export type RouteDisplayEntry = {
    stopLonLat: number[];
    routes: { [k: string]: { nextStopLonLat: number[], prevStopLonLat: number[] } };
}

type RoutesMapProps = {
    entries: RouteDisplayEntry[];
}
export function RoutesMap({ entries }: RoutesMapProps) {

    if (import.meta.env.DEV) {
        console.log('Render routes', entries);
    }

    const map = useContext(MapContext)?.map;
    const layerControls = useContext(MapContext)?.layerControls;

    const [mapStylesReady, setMapStylesReady] = useState<boolean>(!!map?.getSource('routes'));

    const features = entries.map(({ stopLonLat, routes }) => {
        return Object.entries(routes || {}).map(([routeKey, route]) => {
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
    }).flat();

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
            if (!map.getSource('routes')) {
                console.log('Create routes map styles');

                layerControls?.addOverlayImmediate(routesStyling);
            }

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

        if (!map || !features) {
            import.meta.env.DEV &&
                console.warn('Routes: map or route features is not ready');

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

    return <></>
}