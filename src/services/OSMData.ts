import type { LonLatTuple, OSMElement, OSMElementTags, OSMNode, OSMRelation, OSMWay } from "./OSMData.types";

const stopsQ: string = `
[out:json][timeout:900];
(
  node["public_transport"="platform"]({{bbox}});
  way["public_transport"="platform"]({{bbox}});
  
  node["public_transport"="stop_position"]({{bbox}});
  
  node["highway"="bus_stop"]({{bbox}});
  node["highway"="platform"]({{bbox}});

  node["amenity"="bus_station"]({{bbox}});
  way["amenity"="bus_station"]({{bbox}});
  
  node["railway"="tram_stop"]({{bbox}});
  node["railway"="platform"]({{bbox}});
  way["railway"="platform"]({{bbox}});
);
out meta;
>;
out meta qt;
`;

export function queryForId(id: number, type: 'node' | 'way') {
    return `
[out:json][timeout:900];
${type}(${id});
out meta qt;
`;

}

const ROUTE_TYPES = ['bus', 'ferry', 'train', 'railway', 'tram', 'trolleybus', 'aerialway'];
const routesQ: string = `
[out:json][timeout:900];
(
  relation["route"~"^(${ROUTE_TYPES.join('|')})$"]({{bbox}});
  relation["type"="route_master"]({{bbox}});
);
out meta;
>;
out meta qt;
`;

export type BBOX = {
    minx: number;
    miny: number;
    maxx: number;
    maxy: number;
}

const endpoint = 'https://overpass-api.de/api/interpreter';

export async function queryStops(bbox: BBOX) {
    const bboxString = getBBOXString(bbox);
    const query = stopsQ.replaceAll('{{bbox}}', bboxString);

    return queryOverpass(query);
}

export async function queryRoutes(bbox: BBOX) {
    const bboxString = getBBOXString(bbox);
    const query = routesQ.replaceAll('{{bbox}}', bboxString);

    return queryOverpass(query);
}

function getBBOXString(bbox: BBOX) {
    // min_lat, min_lon, max_lat, max_lon
    return `${bbox.miny},${bbox.minx},${bbox.maxy},${bbox.maxx}`;
}

export async function queryOverpass(query: string) {
    const response = await fetch(endpoint, {
        method: "POST",
        mode: "cors",
        cache: "no-cache",
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'
        },
        body: `data=${encodeURIComponent(query)}`
    });

    return await response.json();
}

export function getElementLonLat(e: OSMElement, osmData: OSMData) {
    if (e.type === 'node') {
        return [e.lon, e.lat] as LonLatTuple;
    }

    if (e.type === 'way') {
        const nodes = e.nodes
            .map(nid => osmData.getNodeById(nid))
            .filter(n => n !== undefined);

        if (nodes.length === 0) {
            console.log('Failed to load nodes for way', e);
            return undefined;
        }

        try {
            const llngs = nodes.map(({ lat, lon }) => ({ lat, lng: lon }));
            // @ts-ignore
            const center = new L.LatLngBounds(llngs).getCenter();

            return [center.lng, center.lat] as LonLatTuple;
        }
        catch (err) {
            console.log('Failed to get geometry for way', e, nodes);
            console.error('Failed to get geometry for way', err);
        }
    }

    if (e.type === 'relation') {

    }

}

export function lonLatToLatLng(lonLat: LonLatTuple) {
    if (!lonLat) {
        return undefined;
    }

    const [lng, lat] = lonLat;

    return { lng, lat };
}

type LatLngLiteral = { lat: number, lng: number };
export type OsmElementFilter = (e: OSMElement) => boolean;

export type OSMDataChange = {
    element: OSMElement
    original: OSMElement
    action: string[]
};
export type ElementChangeAction = {
    element: OSMElement
    action: string
};
export type TagStatistics = Map<string, number>;

export default class OSMData {
    idMap: Map<string, OSMElement>
    newIdCounter: number
    elements: OSMElement[]
    changes: OSMDataChange[]

    constructor() {
        this.newIdCounter = -1;
        this.changes = [];

        this.elements = [];
        this.idMap = new Map<string, OSMElement>();
    }

    calculateTagStatistics(filter: OsmElementFilter) {
        const stats = new Map<string, number>();

        const elements = filter ? this.elements.filter(filter) : this.elements;

        elements.forEach(element => {
            element.tags && Object.keys(element.tags).forEach(key => {
                // @ts-ignore
                const occurances = stats.has(key) ? stats.get(key) + 1 : 1;
                stats.set(key, occurances);
            });
        });

        return stats;
    }

    listChanges() {
        return this.changes.filter(change => {

            // If we only have changed tags, 
            // check that tags actually do not match original version
            if (change.action.every(a => a === 'change_tags')) {
                return !shallowCompare(change.element.tags, change.original.tags);
            }

            return true;
        });
    }

    updateOverpassData(overpassData: OSMData) {
        overpassData.elements.forEach(e => {
            this.updateElement(e);
        });
    }

    updateElement(element: OSMElement) {
        const { id, type } = element;
        const key = `${type}${id}`;

        if (this.idMap.has(key)) {
            // TBD, check for edits
        }
        else {
            this.addElement(element);
        }

    }

    createNewNode({ lat, lng }: LatLngLiteral, tags: OSMElementTags) {

        const element = {
            // In OSM data files negative IDs are used for newly created elements
            id: this.newIdCounter--,
            type: 'node',
            lon: lng,
            lat: lat,
            tags
        } as OSMNode;

        this.addElement(element);

        this.commitAction({
            'element': element,
            action: 'create'
        });

        return element;
    }

    setNodeLatLng(latlng: LatLngLiteral, osmElement: OSMElement) {
        this.commitAction({ 'element': osmElement, action: 'update_position' });

        const { lat, lng } = latlng;

        if (osmElement.type === 'node') {
            osmElement.lat = lat;
            osmElement.lon = lng;
        }
    }

    // @ts-expect-error
    setWayLatLng(latlng: LatLngLiteral, osmElement: OSMElement) {
        // TODO:
        console.warn('setWayLatLng not implemented');
    }

    setElementTags(tags: OSMElementTags, osmElement: OSMElement) {
        this.commitAction({ 'element': osmElement, action: 'change_tags' });

        const validTags = Object.entries(tags)
            .filter(([k, v]) => !isBlank(k) && !isBlank(v));

        osmElement.tags = Object.fromEntries(validTags);
    }

    addElement(element: OSMElement) {
        const { id, type } = element;
        const key = `${type}${id}`;

        this.elements.push(element);
        this.idMap.set(key, element);
    }

    commitAction({ element, action }: ElementChangeAction) {
        const existing = this.changes.find(change =>
            change.element.id === element.id &&
            change.element.type === element.type
        );

        if (existing) {
            !existing.action.includes(action) && existing.action.push(action);
        }
        else {
            this.changes.push({
                element,
                original: createElementCopy(element),
                action: [action]
            });
        }
    }

    getNodeById(id: number) {
        return this.getByTypeAndId('node', id) as OSMNode;
    }

    getWayById(id: number) {
        return this.getByTypeAndId('way', id) as OSMWay;
    }

    getRelationById(id: number) {
        return this.getByTypeAndId('relation', id) as OSMRelation;
    }

    getByTypeAndId(type: string, id: number) {
        const key = `${type}${id}`;
        return this.idMap.get(key);
    }

}

function shallowCompare(obj1: OSMElementTags, obj2: OSMElementTags) {
    return Object.keys(obj1).length === Object.keys(obj2).length &&
        Object.keys(obj1).every(key => obj1[key] === obj2[key]);
}

function createElementCopy(element: OSMElement) {
    const copy = {
        ...element,
        tags: {
            ...element.tags
        }
    };

    if (element.type === 'way') {
        return {
            ...copy,
            nodes: [...element.nodes]
        } as OSMWay;
    }

    if (element.type === 'relation') {
        return {
            ...copy,
            members: element.members.map(m => { return { ...m } })
        } as OSMRelation;
    }

    return copy as OSMElement;
}

function isBlank(str: string) {
    return str === undefined || str === null || /^\s*$/.test(str);
}
