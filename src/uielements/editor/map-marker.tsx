import type { MouseEventsHandlers } from "../selection-info";
import { useContext, useEffect } from "preact/hooks";
import { MapContext } from "../../app";
import { Marker } from "maplibre-gl";
import { cls } from "../cls";

import "./map-marker.css"

type HtmlMapMarkerProps = {
    name: string;
    lat: number;
    lon: number;

    className?: string;

    mouseEvents?: MouseEventsHandlers;
}
export function HtmlMapMarker({ name, lat, lon, className, mouseEvents }: HtmlMapMarkerProps) {

    const map = useContext(MapContext)?.map;

    useEffect(() => {
        if (!map) return;

        if (isNaN(lon) || isNaN(lat)) {
            console.error(`Invalid lon/lat for ${name}: ${lon}, ${lat}`);
            return;
        }

        const m = new Marker({ anchor: "bottom" }).setLngLat([lon, lat]).addTo(map);

        m.getElement().classList.add(...cls('map-marker', className).split(' '));
        m.getElement().innerText = name;

        const { onClick, onHoverUpdate } = mouseEvents || {};

        m.on('click', () => onClick?.());
        m.on('mouseenter', () => onHoverUpdate?.(true));
        m.on('mouseleave', () => onHoverUpdate?.(false));

        return () => {
            m.remove();
        }

    }, [map, name, lat, lon, className, mouseEvents]);

    return <></>
}