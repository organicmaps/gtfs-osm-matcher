import { OSMElement } from "./OSMData.types";

const BASE = 'http://localhost:8111'

/**
 * Interface to call JOSM Remote commands
 * https://josm.openstreetmap.de/wiki/Help/RemoteControlCommands
 */

/**
 * https://josm.openstreetmap.de/wiki/Help/RemoteControlCommands#load_object
*/
export function loadInJOSM(osmElements: OSMElement[], loadReferers = false, newLayer = true, members = false) {
    const ids = osmElements?.map(e => `${e.type[0]}${e.id}`);

    const urlArgs = {
        objects: ids.join(),
        new_layer: newLayer,
        referrers: loadReferers,
        relation_members: members
    }

    const url = new URL('load_object', BASE);
    Object.entries(urlArgs).forEach(([k, v]) => url.searchParams.append(k, v.toString()));

    console.log('Call josm remote', url);
    fetch(url).catch(e => {
        alert('failed to open JOSM remote');
        console.warn('Failed to call JOSM remote', e);
    });
}
