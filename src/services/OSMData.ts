import { getDistanceLonLat } from "../map/distance";
import type { LonLatTuple, OSMElement, OSMElementTags, OSMNode, OSMRelation, OSMWay } from "./OSMData.types";
import { type BBox } from "./tile-utils";

const stopsQ: string = `
[out:json][timeout:1800];
(
  node["public_transport"="platform"]({{bbox}});
  way["public_transport"="platform"]({{bbox}});
  
  node["public_transport"="stop_position"]({{bbox}});
  
  node["highway"="bus_stop"]({{bbox}});
  node["highway"="platform"]({{bbox}});

  node["amenity"="bus_station"]({{bbox}});
  way["amenity"="bus_station"]({{bbox}});
  
  node["amenity"="ferry_terminal"]({{bbox}});
  way["amenity"="ferry_terminal"]({{bbox}});
  
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

var throttlePromise: Promise<void> | null = null;

const endpoint = 'https://overpass-api.de/api/interpreter';

export async function queryStops(bbox: BBox) {
    const bboxString = getBBOXString(bbox);
    const query = stopsQ.replaceAll('{{bbox}}', bboxString);

    if (throttlePromise) {
        await throttlePromise;
    }

    throttlePromise = new Promise((resolve) => {
        setTimeout(() => {
            throttlePromise = null;
            resolve();
        }, 2500);
    });

    return queryOverpass(query);
}

export async function queryRoutes(bbox: BBox) {
    const bboxString = getBBOXString(bbox);
    const query = routesQ.replaceAll('{{bbox}}', bboxString);

    return queryOverpass(query);
}

function getBBOXString(bbox: BBox) {
    // south, west, north, east
    return `${bbox.south},${bbox.west},${bbox.north},${bbox.east}`;
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

            if (nodes[0].id === nodes[nodes.length - 1].id) {
                const center = getBoundsCenter(llngs);

                if (!center) {
                    console.log('Failed to get geometry for way', e, nodes);
                    return undefined;
                }

                return [center.lng, center.lat] as LonLatTuple;
            }
            else {
                const center = getLineCenter(llngs);

                if (!center) {
                    console.log('Failed to get geometry for way', e, nodes);
                    return undefined;
                }

                return [center.lng, center.lat] as LonLatTuple;
            }

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

    dataUpdated: () => void;

    constructor() {
        this.newIdCounter = -1;
        this.changes = [];

        this.dataUpdated = () => { };

        this.elements = [];
        this.idMap = new Map<string, OSMElement>();
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
        if (overpassData.elements &&
            Array.isArray(overpassData.elements)) {

            overpassData.elements.forEach(e => {
                this.updateElement(e);
            });

            this.dataUpdated();
        }
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

        this.dataUpdated();
    }

    getLonLat(element: OSMElement) {
        return getElementLonLat(element, this);
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

    getByNWRId(nwrid: string) {
        const type = nwrid[0] === 'n' ? 'node' : nwrid[0] === 'w' ? 'way' : 'relation';
        const id = parseInt(nwrid.substring(1));
        return this.getByTypeAndId(type, id);
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

export const OSM_DATA = new OSMData();

/**
 * Calculates the center of a set of coordinates.
 * @param points Array of {lat, lng} objects
 * @returns Center point {lat, lng}
 */
export function getBoundsCenter(points: { lat: number, lng: number }[]): { lat: number, lng: number } | undefined {
    if (points.length === 0) {
        return undefined;
    }

    let minLat = Infinity;
    let maxLat = -Infinity;
    let minLng = Infinity;
    let maxLng = -Infinity;

    for (const p of points) {
        minLat = Math.min(minLat, p.lat);
        maxLat = Math.max(maxLat, p.lat);
        minLng = Math.min(minLng, p.lng);
        maxLng = Math.max(maxLng, p.lng);
    }

    return {
        lat: (minLat + maxLat) / 2,
        lng: (minLng + maxLng) / 2
    };
}

/**
 * Calculates the center of a line (middle point along the path).
 * @param points Array of {lat, lng} objects
 * @returns Center point {lat, lng}
 */
export function getLineCenter(points: { lat: number, lng: number }[]): { lat: number, lng: number } | undefined {
    if (points.length === 0) {
        return undefined;
    }
    if (points.length === 1) {
        return points[0];
    }

    let totalDist = 0;
    const dists: number[] = [];

    // Calculate total length and segment lengths
    for (let i = 0; i < points.length - 1; i++) {
        const d = getDistanceLonLat([points[i].lng, points[i].lat], [points[i + 1].lng, points[i + 1].lat]);
        totalDist += d;
        dists.push(d);
    }

    let currentDist = 0;
    const halfDist = totalDist / 2;

    // Find the segment containing the midpoint
    for (let i = 0; i < points.length - 1; i++) {
        if (currentDist + dists[i] >= halfDist) {
            const segmentDist = dists[i];
            const distInSegment = halfDist - currentDist;
            const ratio = segmentDist === 0 ? 0 : distInSegment / segmentDist;

            const p1 = points[i];
            const p2 = points[i + 1];

            return {
                lat: p1.lat + (p2.lat - p1.lat) * ratio,
                lng: p1.lng + (p2.lng - p1.lng) * ratio
            };
        }
        currentDist += dists[i];
    }

    return points[points.length - 1];
}
