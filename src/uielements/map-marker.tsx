import { useContext, useEffect } from "preact/hooks";
import { MapContext } from "../app";
import { Marker } from "maplibre-gl";

type HtmlMapMarkerProps = {
    name: string
    lat: number
    lon: number
}
export function HtmlMapMarker({ name, lat, lon }: HtmlMapMarkerProps) {

    const map = useContext(MapContext)?.map;

    useEffect(() => {
        if (!map) return;

        const m = new Marker({ anchor: "bottom" }).setLngLat([lon, lat]).addTo(map);
        m.getElement().classList.add('map-marker');
        m.getElement().innerText = name;

        return () => {
            m.remove();
        }

    }, [map, name, lat, lon]);

    return <></>
}