import { useContext, useEffect, useMemo } from "preact/hooks";
import { MapContext } from "../app";
import type { Schedule } from "./schedule.types";
import { activeRouteGeometries, dateAsNumber } from "./ScheduleEncoding";

type RouteGeometriesProps = {
    schedules: Schedule[];
}

export function RouteGeometries({ schedules }: RouteGeometriesProps) {
    const mapContext = useContext(MapContext);
    const map = mapContext?.map;
    const mapLoaded = mapContext?.loaded;

    const i_today = dateAsNumber(new Date());

    const features = useMemo(
        () => schedules.flatMap(s => activeRouteGeometries(s, i_today)),
        [schedules, i_today]
    );

    useEffect(() => {
        if (!map || !mapLoaded) return;

        const SOURCE = 'route-geometries';
        const LAYER  = 'route-geometries-line';
        const canceled = { value: false };

        mapLoaded.then(map => {
            if (canceled.value) return;
            const geojson = { type: 'FeatureCollection' as const, features };
            if (map.getSource(SOURCE)) {
                (map.getSource(SOURCE) as any).setData(geojson);
            } else if (features.length > 0) {
                map.addSource(SOURCE, { type: 'geojson', data: geojson });
                const before = map.getLayer('stops-preview') ? 'stops-preview' : undefined;
                map.addLayer({
                    id: LAYER,
                    type: 'line',
                    source: SOURCE,
                    layout: { 'line-join': 'round', 'line-cap': 'round' },
                    paint: {
                        'line-color': ['coalesce', ['get', 'color'], '#2c77a5'],
                        'line-width': 2,
                        'line-opacity': 0.7,
                    },
                }, before);
            }
        });

        return () => {
            canceled.value = true;
            try {
                if (map.getLayer(LAYER)) map.removeLayer(LAYER);
                if (map.getSource(SOURCE)) map.removeSource(SOURCE);
            } catch (_) {}
        };
    }, [map, mapLoaded, features]);

    return <></>;
}
