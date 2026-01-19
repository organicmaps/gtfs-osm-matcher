import { useContext, useEffect, useState } from "preact/hooks";
import { OSM_DATA } from "../../services/OSMData";
import { MapContext } from "../../app";
import { Marker } from "maplibre-gl";


type AddOsmStopControllerProps = {
    name: string;
    id: string;
    code?: string;
    routeTypes?: string | string[];
    idTags?: { [tag: string]: number };
}
export function AddOsmStopController({ name, id, code, routeTypes, idTags }: AddOsmStopControllerProps) {
    const map = useContext(MapContext)?.map;
    const [active, setActive] = useState(false);

    useEffect(() => {
        if (!map) {
            return;
        }

        if (active) {
            const sub = map.on('click', (e) => {
                const m = new Marker().setLngLat([e.lngLat.lng, e.lngLat.lat]).addTo(map);
                m.getElement().innerText = name;

                if (routeTypes && typeof routeTypes === 'string') {
                    routeTypes = routeTypes.split(/[\s,;]+/).map((s) => s.toLowerCase().trim());
                }

                const typeTags = getTypeTags((routeTypes || []) as string[]);

                const gtfsIdTag = Object.entries(idTags || {}).map(([k, _cnt]) => k)[0] || 'ref:gtfs';
                const tags = {
                    name,
                    [gtfsIdTag]: code || id,
                    ...typeTags
                };

                OSM_DATA.createNewNode(e.lngLat, tags);

                setActive(false);
            });

            return () => {
                sub.unsubscribe();
            }
        }

    }, [map, active, setActive, name, id, code, idTags, routeTypes]);

    return (
        <>
            {active ?
                <span>
                    <span>Click on map to add OSM Stop </span>
                    <button onClick={() => setActive(false)}>Cancel</button>
                </span> :
                <button onClick={() => setActive(true)}>Add OSM Stop</button>}
        </>
    )
}

function getTypeTags(routeTypes: string[]) {
    const typeTags: { [tag: string]: string } = {};

    typeTags['public_transport'] = 'platform';

    for (const type of routeTypes) {
        if (type === 'bus') {
            typeTags['highway'] = 'bus_stop';
            typeTags['bus'] = 'yes';
        } else if (type === 'tram') {
            typeTags['railway'] = 'tram_stop';
            typeTags['tram'] = 'yes';
        } else if (type === 'subway') {
            typeTags['railway'] = 'subway_station';
            typeTags['subway'] = 'yes';
        } else if (type === 'train') {
            typeTags['railway'] = 'station';
            typeTags['train'] = 'yes';
        } else if (type === 'ferry') {
            typeTags['ferry'] = 'yes';
        } else if (type === 'aerialway') {
            typeTags['aerialway'] = 'station';
        } else {
            console.log('Unknown route type', type);
        }
    }

    return typeTags;
}