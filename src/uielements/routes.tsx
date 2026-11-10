import { useContext, useEffect, useMemo, useState } from "preact/hooks";
import { MapContext } from "../app";
import { routesStyling } from "./routes-styling";
import type { GeoJSONSource, GeoJSONSourceSpecification } from "maplibre-gl";
import type { Feature, FeatureCollection } from "geojson";

export type FullRouteDisplayEntry = {
    routeKey: string;
    coordinates: [number, number][];
    kind?: 'gtfs' | 'osm';
}

type RoutesMapProps = {
    fullRoutes?: FullRouteDisplayEntry[];
}
export function RoutesMap({ fullRoutes = [] }: RoutesMapProps) {

    const map = useContext(MapContext)?.map;
    const layerControls = useContext(MapContext)?.layerControls;

    const [mapStylesReady, setMapStylesReady] = useState<boolean>(!!map?.getSource('routes'));

    // Memoised here rather than at the call sites: this component re-renders
    // whenever its parent does, and a fresh array identity makes the effect below
    // wipe the source to an empty FeatureCollection before setting it again --
    // visible as a flash on every unrelated state change.
    const allFeatures = useMemo(() => fullRoutes.map(({ routeKey, coordinates, kind }): Feature => ({
        type: 'Feature',
        geometry: {
            type: 'LineString',
            coordinates
        },
        properties: {
            name: routeKey,
            kind: kind || 'gtfs'
        }
    })), [fullRoutes]);

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
            // addOverlayImmediate is idempotent, so this does not need to guard on
            // map.getSource -- which is the wrong registry to ask anyway, and reads
            // as absent while setStyle rebuilds.
            layerControls?.addOverlayImmediate(routesStyling);
            setMapStylesReady(true);
        };

        // addSource needs the parsed style, not the first full render. The
        // stylesheet is set when style.load fires, including after setStyle.
        if (map.style?.stylesheet) createRouteLayers();
        else map.once('style.load', createRouteLayers);

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

        const data: FeatureCollection = {
            type: 'FeatureCollection',
            features: allFeatures
        };

        // Draw the data and mirror it into the stored overlay spec as well:
        // setBaseStyle rebuilds the style from that spec, so replaying the empty
        // collection it was declared with would clear the route until the selection
        // changes. StopsLayer keeps its own spec in step the same way.
        (routesStyling.sources.routes as GeoJSONSourceSpecification).data = data;

        const source = map.getSource('routes') as GeoJSONSource | undefined;
        if (source) {
            source.setData(data);
        }
        else {
            console.warn('Map source routes not ready');
        }

        return () => {
            const empty: FeatureCollection = {
                type: 'FeatureCollection',
                features: []
            };
            (routesStyling.sources.routes as GeoJSONSourceSpecification).data = empty;
            (map.getSource('routes') as GeoJSONSource | undefined)?.setData(empty);
        };

    }, [map, allFeatures, mapStylesReady]);

    return <></>
}
