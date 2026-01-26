import { useCallback, useContext } from "preact/hooks";
import { MapContext } from "../app";

const locateStyle = {
    cursor: 'pointer',
    textDecoration: 'underline',
    fontSize: '1.2em'
};

type LocateMeProps = {
    zoom?: number
    lonlatFeature: { lon: number, lat: number } & any
}
export function LocateMe({ lonlatFeature, zoom }: LocateMeProps) {
    const map = useContext(MapContext)?.map;

    const flyTo = useCallback(() => {
        if (map && lonlatFeature.lon && lonlatFeature.lat) {
            map.flyTo({ zoom, center: [lonlatFeature.lon, lonlatFeature.lat] })
        }
    }, [map, lonlatFeature]);

    return <span style={locateStyle} onClick={flyTo}>&#x21D8;</span>
}