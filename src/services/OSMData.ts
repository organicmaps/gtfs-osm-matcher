import { getDistanceLonLat } from "../map/distance";
import type { LonLatTuple, OSMElement, OSMElementTags, OSMNode, OSMRelation, OSMWay } from "./OSMData.types";

/**
 * The element type an nwr id names: `n1236383343` is a node, `w1420729449` a way,
 * `r5832475` a relation. Everything in the report is keyed this way.
 */
export function nwrType(nwrId: string): 'node' | 'way' | 'relation' {
    return nwrId[0] === 'n' ? 'node' : nwrId[0] === 'w' ? 'way' : 'relation';
}

/**
 * The osm.org page for an nwr id. The path needs the type spelled out —
 * `osm.org/node/5609695632`, not `osm.org/n5609695632`, which is a 404.
 */
export function osmFeatureUrl(nwrId: string): string {
    return `https://osm.org/${nwrType(nwrId)}/${nwrId.substring(1)}`;
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

export default class OSMData {
    idMap: Map<string, OSMElement>
    newIdCounter: number
    elements: OSMElement[]
    changes: OSMDataChange[]

    private listeners = new Set<() => void>();

    /**
     * Bumped on every change, and the value `useSyncExternalStore` reads.
     *
     * `elements` is built once and pushed to, so its identity never changes and a snapshot of
     * it is the same value before and after an Overpass response — the store fired, the
     * snapshot compared equal, and nothing re-rendered. Anything derived from the store has to
     * key on this instead.
     */
    revision = 0;

    subscribe(fn: () => void): () => void {
        this.listeners.add(fn);
        return () => this.listeners.delete(fn);
    }

    private emit() {
        this.revision++;
        this.listeners.forEach(fn => fn());
    }

    constructor() {
        this.newIdCounter = -1;
        this.changes = [];
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

    updateOverpassData(overpassData: Pick<OSMData, 'elements'>) {
        if (overpassData.elements &&
            Array.isArray(overpassData.elements)) {

            overpassData.elements.forEach(e => {
                this.updateElement(e);
            });

            this.emit();
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
        this.commitAction({ 'element': osmElement, action: 'change_tags' }, false);

        const validTags = Object.entries(tags)
            .filter(([k, v]) => !isBlank(k) && !isBlank(v));

        osmElement.tags = Object.fromEntries(validTags);
        this.emit();
    }

    addElement(element: OSMElement) {
        const { id, type } = element;
        const key = `${type}${id}`;

        this.elements.push(element);
        this.idMap.set(key, element);
    }

    commitAction({ element, action }: ElementChangeAction, notify = true) {
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

        if (notify) this.emit();
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
        return this.getByTypeAndId(nwrType(nwrid), parseInt(nwrid.substring(1)));
    }

    getByTypeAndId(type: string, id: number) {
        const key = `${type}${id}`;
        return this.idMap.get(key);
    }

}

/**
 * Serializes tracked changes as JOSM-loadable .osm XML.
 */
export function encodeChanges(changes: OSMDataChange[], region?: string, osmData?: OSMData) {
    const changedElements = new Map(changes.map(({ element }) => [`${element.type}${element.id}`, element]));
    const elements = new Map(changedElements);
    const originals = new Map(osmData?.changes.map(({ element, original }) => [
        `${element.type}${element.id}`, original,
    ]));

    // Iterating the map also visits dependencies added along the way. Entries are
    // deduplicated before traversal, including cyclic relation memberships.
    for (const element of elements.values()) {
        const references = element.type === 'way'
            ? element.nodes.map(ref => ({ type: 'node' as const, ref }))
            : element.type === 'relation' ? element.members : [];
        for (const { type, ref } of references) {
            const key = `${type}${ref}`;
            if (elements.has(key)) continue;
            // Included edits win; ignored edits must use their original data.
            const dependency = originals.get(key)
                ?? osmData?.getByTypeAndId(type, ref);
            if (!dependency || (dependency.type === 'node' && (!Number.isFinite(dependency.lat) || !Number.isFinite(dependency.lon)))) {
                throw new Error(`Cannot export ${element.type} ${element.id}: ${type} ${ref} is missing. Reload the OSM data and try again.`);
            }
            elements.set(key, dependency);
        }
    }

    const elementOrder = { node: 0, way: 1, relation: 2 };
    const xmlNodes = [...elements.values()]
        .sort((a, b) => elementOrder[a.type] - elementOrder[b.type])
        .map(element => {
            const tagElements = Object.entries(element.tags || {})
                .map(([k, v]) => ({ tag: { _attr: { k, v } } }));

            const attr: Record<string, string | number> = {
                id: element.id,
                version: element.version ?? 0,
            };
            if (changedElements.has(`${element.type}${element.id}`)) {
                attr.action = 'modify';
            }
            if (element.type === 'node') {
                attr.lat = element.lat;
                attr.lon = element.lon;
            }

            const children = element.type === 'way'
                ? [...element.nodes.map(ref => ({ nd: { _attr: { ref } } })), ...tagElements]
                : element.type === 'relation'
                    ? [...element.members.map(({ type, ref, role }) => ({ member: { _attr: { type, ref, role: role ?? '' } } })), ...tagElements]
                    : tagElements;

            return {
                [element.type]: [{ _attr: attr }, ...children]
            }
        });

    const changesetTags = [
        { tag: { _attr: { k: 'created_by', v: 'gtfs-osm-matcher.organicmaps.app' } } },
        { tag: { _attr: { k: 'hashtags', v: '#gtfs;#gtfs-osm-matcher;#organicmaps' } } },
    ];

    if (region) {
        changesetTags.push({ tag: { _attr: { k: 'data_used', v: region } } });
    }

    return xml({ osm: [{ _attr: { version: "0.6", generator: "osm-gtfs" } }, { changeset: changesetTags }, ...xmlNodes] }, { declaration: true });
}

function xml(root: any, options?: { declaration?: boolean }) {
    let output = '';
    if (options?.declaration) {
        output += '<?xml version="1.0" encoding="UTF-8"?>\n';
    }

    function escape(str: string) {
        return String(str).replace(/[<>&'"]/g, (c) => {
            switch (c) {
                case '<': return '&lt;';
                case '>': return '&gt;';
                case '&': return '&amp;';
                case '\'': return '&apos;';
                case '"': return '&quot;';
            }
            return c;
        });
    }

    function renderAttributes(attributes: any) {
        if (!attributes) return '';
        return Object.entries(attributes)
            .map(([k, v]) => ` ${k}="${escape(String(v))}"`)
            .join('');
    }

    function render(obj: any): string {
        if (Array.isArray(obj)) {
            return obj.map(render).join('');
        }
        if (typeof obj !== 'object' || obj === null) {
            return escape(String(obj));
        }

        return Object.entries(obj).map(([key, value]) => {
            let attrs = '';
            let children: any[] = [];

            if (Array.isArray(value)) {
                let list = value;
                // Check for _attr in the first element
                if (list.length > 0 && list[0] && typeof list[0] === 'object' && (list[0] as any)._attr) {
                    attrs = renderAttributes((list[0] as any)._attr);
                    list = list.slice(1);
                }
                children = list;
            } else if (typeof value === 'object' && value !== null) {
                if ((value as any)._attr) {
                    attrs = renderAttributes((value as any)._attr);
                    // Use remaining properties as children
                    const { _attr, ...rest } = value as any;
                    if (Object.keys(rest).length > 0) {
                        children = [rest];
                    }
                } else {
                    children = [value];
                }
            } else {
                children = [value];
            }

            const content = children.map((c) => {
                if (typeof c === 'object' && c !== null) {
                    return render(c);
                }
                return escape(String(c));
            }).join('');

            return `<${key}${attrs}>${content}</${key}>`;
        }).join('');
    }

    output += render(root);
    return output;
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
        // TODO: (requires changes to overpass query and backend first)
    }

}

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
