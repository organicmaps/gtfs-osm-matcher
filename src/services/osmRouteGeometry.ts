import { memoFetch } from './memoFetch';

const OVERPASS_ENDPOINT = 'https://overpass-api.de/api/interpreter';
const routeGeometryCache: Record<string, Promise<[number, number][][]>> = {};

type OverpassWay = {
    type: string;
    geometry?: { lat: number; lon: number }[];
};

/** Fetch the member ways of a matched OSM route relation as drawable lines. */
export function getOsmRouteGeometry(relationId: number): Promise<[number, number][][]> {
    return memoFetch(routeGeometryCache, String(relationId), async () => {
        const query = `[out:json][timeout:25];relation(${relationId});way(r);out geom;`;
        const response = await fetch(OVERPASS_ENDPOINT, {
            method: 'POST',
            mode: 'cors',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
            body: `data=${encodeURIComponent(query)}`,
        });
        if (!response.ok) throw new Error(`Overpass returned ${response.status}`);

        const data = await response.json() as { elements?: OverpassWay[]; remark?: string };
        if (data.remark) throw new Error(data.remark);
        return (data.elements || [])
            .filter(way => way.type === 'way' && (way.geometry?.length || 0) >= 2)
            .map(way => way.geometry!.map(point => [point.lon, point.lat] as [number, number]));
    });
}
