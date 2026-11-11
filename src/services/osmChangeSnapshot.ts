import type { OSMDataChange } from './OSMData';
import type { OSMElement } from './OSMData.types';

function elementKey(element: OSMElement) {
    return `${element.type}${element.id}`;
}

function elementSignature(element: OSMElement) {
    return JSON.stringify([
        element.type, element.id, element.version,
        Object.entries(element.tags).sort(([a], [b]) => a.localeCompare(b)),
        element.type === 'node' ? [element.lat, element.lon]
            : element.type === 'way' ? element.nodes
                : element.members.map(({ type, ref, role }) => [type, ref, role ?? '']),
    ]);
}

/** Capture values, rather than references to the mutable editor elements. */
export function snapshotChanges(changes: OSMDataChange[]) {
    return new Map(changes.map(({ element }) => [elementKey(element), elementSignature(element)]));
}

export function unchangedChanges(changes: OSMDataChange[], snapshot: Map<string, string>) {
    return changes.filter(({ element }) => snapshot.get(elementKey(element)) === elementSignature(element));
}
