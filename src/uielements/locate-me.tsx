import { useCallback, useContext } from "preact/hooks";
import { MapContext } from "../app";

type LocateMeProps = {
    zoom?: number
    lonlatFeature: {lon: number, lat: number} & any
}
export function LocateMe({lonlatFeature, zoom}: LocateMeProps) {
    const map = useContext(MapContext)?.map;

    const flyTo = useCallback(() => {
        if (map && lonlatFeature.lon && lonlatFeature.lat) {
            map.flyTo({zoom, center: [lonlatFeature.lon, lonlatFeature.lat]})
        }
    }, [map, lonlatFeature]);

    return <img className={"locate-icon"} src="/locate.svg" onClick={flyTo}></img>
}