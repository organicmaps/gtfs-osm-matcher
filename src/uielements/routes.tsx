import { useContext, useEffect, useMemo, useRef } from "preact/hooks";
import { MapContext } from "../app";
import { routesStyling } from "./routes-styling";
import type { Overlay } from "../map/layers-controls";
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

    // The overlay is registered once and stays on the map afterwards: its source and
    // layers live in the shared routesStyling spec, and opening and closing panels
    // should not remove and re-add them. Only the data changes.
    const overlayRef = useRef<Overlay | null>(null);

    // Built here and not at the call sites: this component re-renders whenever its
    // parent does, and a new array identity would make the effect below empty the
    // source and refill it on every unrelated state change.
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

    const data = useMemo<FeatureCollection>(() => ({
        type: 'FeatureCollection',
        features: allFeatures
    }), [allFeatures]);

    // The data as of the last render, for the moment the overlay is finally
    // registered: the style may finish loading after the data has changed already.
    const dataRef = useRef(data);
    dataRef.current = data;

    useEffect(() => {
        if (!map) return;

        let canceled = false;

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
            if (canceled) return;
            overlayRef.current = layerControls?.addOverlayImmediate(routesStyling) ?? null;
            overlayRef.current?.setSourceData('routes', dataRef.current);
        };

        // Sources can only be added once the style is parsed. style.load fires for
        // the first style as well as for every setStyle, so it is also the right
        // moment after a base-style switch.
        if (map.style?.stylesheet) createRouteLayers();
        else map.once('style.load', createRouteLayers);

        return () => {
            canceled = true;
            map.off('style.load', createRouteLayers);
        };
    }, [map, layerControls]);

    useEffect(() => {
        overlayRef.current?.setSourceData('routes', data);

        // Leaving the tab must not leave the route drawn behind it. The overlay
        // itself stays registered; only its data is emptied.
        return () => overlayRef.current?.setSourceData('routes', {
            type: 'FeatureCollection',
            features: []
        });
    }, [data]);

    return <></>
}
