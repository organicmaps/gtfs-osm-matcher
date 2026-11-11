import type { OSMElement } from "./OSMData.types";
import OSMData, { OSM_DATA } from "./OSMData";
import { getTileBBox, type BBox, type TileXYZ } from "./tile-utils";

const OVERPASS_ENDPOINT = 'https://overpass-api.de/api/interpreter';

const OSM_ENDPOINT = 'https://api.openstreetmap.org/api/0.6';

const stopsQ: string = `
[out:json][timeout:1800];
(
  node["public_transport"~"platform|stop_position|station|stop"]({{bbox}});
  way["public_transport"~"platform|stop_position|station|stop"]({{bbox}});
  relation["public_transport"~"platform|stop_position|station|stop"]({{bbox}});
  
  node["highway"="bus_stop"]({{bbox}});
  node["highway"="platform"]({{bbox}});

  node["amenity"~"bus_station|ferry_terminal"]({{bbox}});
  way["amenity"~"bus_station|ferry_terminal"]({{bbox}});
  relation["amenity"~"bus_station|ferry_terminal"]({{bbox}});
  
  node["aerialway"~"station"]({{bbox}});
  way["aerialway"~"station"]({{bbox}});
  relation["aerialway"~"station"]({{bbox}});
  
  node["railway"~"tram_stop|halt|subway_entrance|platform|stop|station"]({{bbox}});
  way["railway"~"tram_stop|halt|subway_entrance|platform|stop|station"]({{bbox}});
  relation["railway"~"tram_stop|halt|subway_entrance|platform|stop|station"]({{bbox}});
);
out meta;
>>;
out meta qt;
`;

async function queryOverpass(query: string) {
    const response = await fetch(OVERPASS_ENDPOINT, {
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

class OSMQueryQueue {

    tiles: Set<string> = new Set<string>();
    throttlePromise: Promise<void> | null = null;

    async queryStopsForTiles(tiles: TileXYZ[]) {
        for (const t of tiles) {
            const tileKey = `${t.z}_${t.x}_${t.y}`;

            if (this.tiles.has(tileKey)) {
                continue;
            }

            try {
                const overpass = await this.queryStops(getTileBBox(t));
                OSM_DATA.updateOverpassData(overpass);

                this.tiles.add(tileKey);
            } catch (e) {
                console.error('Error fetching osm data', e);
            }
        }
    }

    async queryStops(bbox: BBox) {
        const bboxString = this.getBBOXString(bbox);
        const query = stopsQ.replaceAll('{{bbox}}', bboxString);

        if (this.throttlePromise) {
            await this.throttlePromise;
        }

        this.throttlePromise = new Promise((resolve) => {
            setTimeout(() => {
                this.throttlePromise = null;
                resolve();
            }, 1000);
        });

        return queryOverpass(query);
    }

    async queryDataByIds(nodes: (string | number)[], ways: (string | number)[], relations: (string | number)[] = [], osmData: OSMData = OSM_DATA) {
        const pending = new Map<string, { type: OSMElement['type'], id: string | number }>();
        const enqueue = (type: OSMElement['type'], id: string | number) => {
            const key = `${type}${id}`;
            if (!pending.has(key)) pending.set(key, { type, id });
        };
        nodes.forEach(id => enqueue('node', id));
        ways.forEach(id => enqueue('way', id));
        relations.forEach(id => enqueue('relation', id));

        // Traverse cached elements too: a previously loaded relation may still
        // have missing descendants. The visited map also breaks membership cycles.
        const fetched = new Map<string, OSMElement>();
        let batch = [...pending.values()];
        while (batch.length) {
            const loaded: OSMElement[] = [];
            for (const type of ['node', 'way', 'relation'] as const) {
                const ids = batch.filter(item => item.type === type && !isComplete(osmData.getByTypeAndId(type, Number(item.id))))
                    .map(item => item.id);
                // Keep URLs bounded for large relations.
                for (let offset = 0; offset < ids.length; offset += 200) {
                    const response = await fetch(`${OSM_ENDPOINT}/${type}s.json?${type}s=${ids.slice(offset, offset + 200).join(',')}`);
                    if (!response.ok) throw new Error(`Could not load OSM ${type}s: HTTP ${response.status}`);
                    const data = await response.json() as { elements: OSMElement[] };
                    loaded.push(...data.elements);
                }
            }
            const previousSize = pending.size;
            const elements = batch.map(({ type, id }) => osmData.getByTypeAndId(type, Number(id)))
                .filter((element): element is OSMElement => !!element);
            for (const element of [...elements, ...loaded]) {
                if (element.type === 'way') element.nodes.forEach(id => enqueue('node', id));
                if (element.type === 'relation') element.members.forEach(({ type, ref }) => enqueue(type, ref));
            }
            // Publish only after the whole dependency graph has loaded, so the
            // editor cannot offer an incomplete relation for export.
            loaded.forEach(element => fetched.set(`${element.type}${element.id}`, element));
            batch = [...pending.values()].slice(previousSize);
        }
        // Repair incomplete cached nodes without replacing local edits.
        for (const element of fetched.values()) {
            const existing = osmData.getByTypeAndId(element.type, element.id);
            if (existing && !isComplete(existing)
                && !osmData.changes.some(change => change.element === existing)) {
                Object.assign(existing, element);
            }
        }
        osmData.updateOverpassData({ elements: [...fetched.values()] });
    }

    getBBOXString(bbox: BBox) {
        // south, west, north, east
        return `${bbox.south},${bbox.west},${bbox.north},${bbox.east}`;
    }

}

export const OSM_QUERY_QUEUE = new OSMQueryQueue();

function isComplete(element: OSMElement | undefined) {
    return !!element && (element.type !== 'node' || (Number.isFinite(element.lat) && Number.isFinite(element.lon)));
}
