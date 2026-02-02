import { useContext, useEffect, useState } from "preact/hooks";
import { MapContext } from "../../app";

export function MoveController({ onMove }: { onMove: (lonLat: number[]) => void }) {
    const [active, setActive] = useState(false);
    const map = useContext(MapContext)?.map;

    useEffect(() => {
        if (active && map) {
            const sub = map.on('click', (e) => {
                onMove([e.lngLat.lng, e.lngLat.lat]);
                setActive(false);
            });

            return () => {
                sub.unsubscribe();
            }
        }
    }, [map, active, setActive, onMove]);

    return active ?
        <span>
            <span>Click on map to set new location </span>
            <button onClick={() => setActive(false)}>Cancel</button>
        </span> :
        <button onClick={() => setActive(true)}>Move</button>
}