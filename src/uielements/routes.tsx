import { useContext, useEffect, useState } from "preact/hooks";
import { MapContext } from "../app";
import { routesStyling } from "./routes-styling";
import type { GeoJSONSource } from "maplibre-gl";

export type FullRouteDisplayEntry = {
    routeKey: string;
    coordinates: [number, number][];
}

type RoutesMapProps = {
    fullRoutes?: FullRouteDisplayEntry[];
}
export function RoutesMap({ fullRoutes = [] }: RoutesMapProps) {

    const map = useContext(MapContext)?.map;
    const layerControls = useContext(MapContext)?.layerControls;

    const [mapStylesReady, setMapStylesReady] = useState<boolean>(!!map?.getSource('routes'));

    const fullRouteFeatures = fullRoutes.map(({ routeKey, coordinates }) => ({
        type: 'Feature',
        geometry: {
            type: 'LineString',
            coordinates
        },
        properties: {
            name: routeKey,
            color: 'green'
        }
    }));

    const allFeatures = fullRouteFeatures;

    useEffect(() => {
        if (!map) return;

        if (!map.hasImage('route-arrow')) {
            const img = new Image();
            img.onload = function () {
                if (!map.hasImage('route-arrow')) {
                    map.addImage('route-arrow', img);
                }
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

        if (!map || !allFeatures) {
            import.meta.env.DEV &&
                console.warn('Routes: map or route features is not ready');

            return;
        }

        if (map.getSource('routes')) {
            (map.getSource('routes') as GeoJSONSource).setData({
                type: 'FeatureCollection',
                // @ts-ignore
                features: allFeatures
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

    }, [map, allFeatures, mapStylesReady]);

    return <></>
}