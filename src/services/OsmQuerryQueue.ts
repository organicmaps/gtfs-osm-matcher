import { OSM_DATA } from "./OSMData";
import { getTileBBox, type BBox, type TileXYZ } from "./tile-utils";

const OVERPASS_ENDPOINT = 'https://overpass-api.de/api/interpreter';

const OSM_ENDPOINT = 'https://api.openstreetmap.org/api/0.6';

const stopsQ: string = `
[out:json][timeout:1800];
(
  node["public_transport"~"platform|stop_position|station|stop"]({{bbox}});
  way["public_transport"~"platform|stop_position|station|stop"]({{bbox}});
  
  node["highway"="bus_stop"]({{bbox}});
  node["highway"="platform"]({{bbox}});

  node["amenity"~"bus_station|ferry_terminal"]({{bbox}});
  way["amenity"~"bus_station|ferry_terminal"]({{bbox}});
  
  node["aerialway"~"station"]({{bbox}});
  way["aerialway"~"station"]({{bbox}});
  
  node["railway"~"tram_stop|halt|subway_entrance|platform|stop|station"]({{bbox}});
  way["railway"~"tram_stop|halt|subway_entrance|platform|stop|station"]({{bbox}});
);
out meta;
>;
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

    async queryDataByIds(nodes: any[], ways: any[]) {
        if (nodes.length > 0) {
            await fetch(OSM_ENDPOINT + '/nodes.json?nodes=' + nodes.join(','))
                .then(response => response.json())
                .then(data => {
                    import.meta.env.DEV
                        && console.log('osm nodes data', data);
                    OSM_DATA.updateOverpassData(data);
                });
        }

        if (ways.length > 0) {
            await fetch(OSM_ENDPOINT + '/ways.json?ways=' + ways.join(','))
                .then(response => response.json())
                .then(data => {
                    import.meta.env.DEV
                        && console.log('osm ways data', data);
                    OSM_DATA.updateOverpassData(data);
                });
        }
    }

    getBBOXString(bbox: BBox) {
        // south, west, north, east
        return `${bbox.south},${bbox.west},${bbox.north},${bbox.east}`;
    }

}

export const OSM_QUERY_QUEUE = new OSMQueryQueue();
