import { useCallback, useContext } from "preact/hooks";
import { MapContext } from "../app";
import "./fly-to.css";

type LocateMeProps = {
    zoom?: number
    lonlatFeature: { lon: number, lat: number } & any
}
export function LocateMe({ lonlatFeature, zoom }: LocateMeProps) {
    const map = useContext(MapContext)?.map;

    const flyTo = useCallback(() => {
        if (map && Number.isFinite(lonlatFeature.lon) && Number.isFinite(lonlatFeature.lat)) {
            map.flyTo({ zoom, center: [lonlatFeature.lon, lonlatFeature.lat] })
        }
    }, [map, lonlatFeature]);

    return <button type="button" className="fly-to-button"
        title="Fly to OSM element on map" onClick={flyTo}>
        &#x21D8;
    </button>
}
