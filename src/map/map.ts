import maplibregl, { Map } from "maplibre-gl";
import 'maplibre-gl/dist/maplibre-gl.css';
import { DATA_BASE_URL } from "../config";
import { satMapStyle } from "./styling";
import { LayerControls } from "./layers-controls";

// Zoom further away for mobile
const DEFAULT_ZOOM = screen.width > 1200 ? 4 : 1;
const DEFAULT_LOCATION = { zoom: DEFAULT_ZOOM, lat: 46.16, lon: -29.44 };

export function createMap(containerId: string) {
    const savedLocation = localStorage.getItem('map-location');
    const initialLocation = savedLocation ?
        mapLocationFromHashString(savedLocation) :
        DEFAULT_LOCATION;

    const map = new maplibregl.Map({
        container: containerId,
        style: 'https://tiles.openfreemap.org/styles/bright',
        center: [initialLocation.lon, initialLocation.lat],
        zoom: initialLocation.zoom
    });

    const loadedPromise = new Promise<Map>(resolve => {
        map.once('load', () => resolve(map));
    });

    const layerControls = new LayerControls(map, {
        'cartographic': 'https://tiles.openfreemap.org/styles/bright',
        'satellite': satMapStyle
    });

    const satb = document.getElementById('map-style-button');
    if (satb) {
        satb.onclick = () => {
            layerControls.cycleBaseStyle();
        };
    }

    // The base map is context, not content. Shops, fuel stations and the rest compete with
    // the stop markers this tool exists to show, and at the zooms the work happens at they
    // outnumber them. Applied on every style load, because the switcher rebuilds the style
    // and a one-shot pass would only hold until the first Sat/Geo press.
    // Only from the event: `getStyle()` serializes nothing until the style has loaded, and
    // the style comes from a URL, so a call on the next line would always return early.
    // `style.load` fires for the first load as well as for each switch.
    map.on('style.load', () => hidePoiLayers(map));

    attachStopStructureToggle(map, layerControls, loadedPromise);

    const mapLocationEl = document.getElementById('map-location');

    const locationInput = mapLocationEl?.querySelector('input');
    const osmHref = mapLocationEl?.querySelector('a.goto-button');

    if (!mapLocationEl) {
        console.error('Cant find map-location div');
    }

    map.on('idle', () => {
        if (locationInput && osmHref) {
            const hstr = mapHashString(map);
            locationInput.value = hstr;
            (osmHref as HTMLAnchorElement).href = `https://openstreetmap.org#map=${hstr}`;
            localStorage.setItem('map-location', hstr);
        }
    });

    if (locationInput) {
        (locationInput as HTMLInputElement).onchange = (e: Event) => {
            const { zoom, lon, lat } = mapLocationFromHashString((e.target as HTMLInputElement).value);
    
            if (lon && !Number.isNaN(lon) && lat && !Number.isNaN(lat) && zoom) {
                map.setCenter([lon, lat]);
                map.setZoom(zoom);
            }
    
        };
    }

    // Expose map and layer controls instances
    (window as any).map = map;
    (window as any).layerControls = layerControls;

    return { map, loaded: loadedPromise, layerControls };
}

export function mapHashString(map: Map) {
    const c = map.getCenter();
    return Math.floor(map.getZoom()) + '/' + c.lat.toFixed(5) + '/' + c.lng.toFixed(5);
}

function mapLocationFromHashString(value: string) {
    const components = value.split('/');

    return {
        zoom: parseInt(components[0]),
        lat: parseFloat(components[1]),
        lon: parseFloat(components[2]),
    }
}

export type SelectorToColorProperty = {
    [selector: string]: [string, string]
}
export async function loadSvgWithColors(svgSrc: string, colors: SelectorToColorProperty): Promise<HTMLImageElement> {
    const svgStr = await fetch(svgSrc).then(r => r.text());

    const parser = new DOMParser();
    const doc = parser.parseFromString(svgStr, "image/svg+xml");
    for (const [selector, [prop, color]] of Object.entries(colors)) {
        // @ts-ignore
        doc.querySelectorAll(selector).forEach(el => el.style[prop] = color);
    }

    const modifiedSvg = doc.documentElement.outerHTML;

    const blob = new Blob([modifiedSvg], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);

    return new Promise((resolve) => {
        var img = new Image();
        img.onload = function () {
            resolve(img);
        }
        img.src = url;
    });
}


// ── the stop-structure layer (S1) ────────────────────────────────────────────
//
// What the matcher's boarding-side work reads — each stop's bay,
// the road beside it and which way that road runs — drawn over the report so a refusal can
// be looked at against the geometry that caused it.
//
// One archive, served from the same data root as the reports; a symlink puts it there, so
// there is no second copy of half a gigabyte and no server change.

const STRUCTURE_SOURCE = 'pt-structure';
const STRUCTURE_STOPS = 'pt-structure-stops';
const STRUCTURE_BAYS = 'pt-structure-bays';

/** The zoom the archive is written at. Above it MapLibre overzooms; below it there is nothing. */
const STRUCTURE_ZOOM = 14;

/**
 * The zoom above which the map is somewhere rather than everywhere, so zooming to the
 * archive's own level lands where the viewer was already looking. A city fills the screen
 * at 10; the world view this app opens at is 4.
 */
const NEAR_ENOUGH_ZOOM = 8;

let structureProtocol: Promise<void> | null = null;

function attachStopStructureToggle(map: Map, layerControls: LayerControls,
        loaded: Promise<Map>) {
    const button = document.getElementById('pt-structure-button');
    if (!button) return;

    // A single-zoom archive with two layers: `stops`, a point per stop carrying what the
    // nearest road says about it, and `bays`, a line joining the two sides of a pair.
    const spec = {
        sources: {
            [STRUCTURE_SOURCE]: {
                type: 'vector' as const,
                url: `pmtiles://${DATA_BASE_URL}/pt-structure.pmtiles`,
                minzoom: STRUCTURE_ZOOM,
                maxzoom: STRUCTURE_ZOOM,
            },
        },
        layers: [
            {
                id: STRUCTURE_BAYS,
                type: 'line' as const,
                source: STRUCTURE_SOURCE,
                'source-layer': 'bays',
                minzoom: STRUCTURE_ZOOM,
                paint: { 'line-color': '#7a5cc0', 'line-width': 1.5, 'line-dasharray': [2, 2] },
            },
            {
                id: STRUCTURE_STOPS,
                type: 'circle' as const,
                source: STRUCTURE_SOURCE,
                'source-layer': 'stops',
                minzoom: STRUCTURE_ZOOM,
                paint: {
                    // Whether the layer found a road beside the stop is the thing worth
                    // seeing: it is what the boarding-side vote depends on.
                    'circle-color': ['case',
                        ['==', ['get', 'has_road'], true], '#2f7a54',
                        '#a93b2c',
                    ] as any,
                    'circle-radius': 4,
                    'circle-stroke-width': 1,
                    'circle-stroke-color': '#fff',
                    'circle-opacity': 0.85,
                },
            },
        ],
    };

    let shown = false;
    // Which press is current. The handler awaits, so two quick presses overlap and the map
    // must end up where the last of them asked for -- not where the slowest one finishes.
    let press = 0;
    button.onclick = async () => {
        const thisPress = ++press;
        shown = !shown;
        const wanted = shown;
        // Marked before the awaits: the button answers the finger, and the layer catches up.
        button.classList.toggle('active', wanted);

        if (wanted && !structureProtocol) {
            // Fetched when the layer is first asked for, not with the app: pmtiles and its
            // inflate cost 8.7 kB gzipped, and most visits never press this. Held as a
            // promise so two quick presses share one fetch, and the protocol is registered
            // once per page -- maplibre keeps protocols globally and a second handler for
            // the same scheme throws.
            structureProtocol = import('pmtiles').then(({ Protocol }) => {
                maplibregl.addProtocol('pmtiles', new Protocol().tile);
            });
        }
        if (wanted) {
            await structureProtocol;
        }

        // Awaited, like every other overlay here: addSource throws "Style is not done
        // loading" before the first load, and addOverlayImmediate registers the overlay
        // before it adds it -- so a press during startup used to leave the control holding
        // a layer the map does not have, and the button dead from then on.
        await loaded;
        if (thisPress !== press) {
            // Pressed again while this one was waiting; that press owns the outcome.
            return;
        }

        wanted ? layerControls.addOverlayImmediate(spec) : layerControls.removeOverlayImmediate(spec);
        if (wanted && map.getZoom() < STRUCTURE_ZOOM && map.getZoom() >= NEAR_ENOUGH_ZOOM) {
            // Nothing exists below the archive's own zoom, so zooming in is the difference
            // between a toggle that draws and one that appears to do nothing. Only from
            // somewhere the user has already chosen: from the world view this would land in
            // the middle of the Atlantic at z14, which helps nobody.
            map.easeTo({ zoom: STRUCTURE_ZOOM });
        }
    };
}


/**
 * Keep the base map's transit points of interest and drop the rest.
 *
 * <p>The bright style draws the `poi` source layer through four layers: `poi_transit`, and
 * `poi_r1`/`poi_r7`/`poi_r20` split by the feature's rank. Hiding the last three outright
 * was the first attempt and it took the transit ones with them — `poi_transit`'s own filter
 * is `class` in `airport | bus | rail`, and **`rail` is not a class these tiles use**. Over
 * Zürich HB at z14 the tile carries 9,211 POIs of which `poi_transit` drew 60: the 122
 * `railway` features — tram stops, halts and stations — were in the layers being hidden.
 *
 * <p>So the rank layers are filtered rather than hidden. Their own filter is kept and a
 * class test is added beside it, which leaves every transit POI drawn exactly as the style
 * intended — right icon, right rank, right zoom — and removes the 9,000-odd shops, car parks
 * and waste baskets that made the map unreadable.
 */
const TRANSIT_POI_CLASSES = [
    'railway',        // subclass: station, halt, tram_stop, subway_entrance, funicular
    'bus',            // subclass: bus_stop, bus_station
    'ferry_terminal',
    'harbor',
    'aerialway',
    'airport',
];

/** The rank layers' own filters, which the class test is added to rather than replacing. */
const POI_RANK_FILTERS: { [id: string]: unknown } = {
    poi_r1: ['all', ['match', ['geometry-type'], ['MultiPoint', 'Point'], true, false],
        ['>=', ['get', 'rank'], 1], ['<', ['get', 'rank'], 7]],
    poi_r7: ['all', ['match', ['geometry-type'], ['MultiPoint', 'Point'], true, false],
        ['>=', ['get', 'rank'], 7], ['<', ['get', 'rank'], 20]],
    poi_r20: ['all', ['match', ['geometry-type'], ['MultiPoint', 'Point'], true, false],
        ['>=', ['get', 'rank'], 20]],
};

function hidePoiLayers(map: Map) {
    const style = map.getStyle();
    if (!style?.layers) return;
    const transitOnly = ['in', ['get', 'class'], ['literal', TRANSIT_POI_CLASSES]];
    for (const layer of style.layers) {
        if ((layer as { 'source-layer'?: string })['source-layer'] !== 'poi') {
            continue;
        }
        const own = POI_RANK_FILTERS[layer.id];
        if (own) {
            // @ts-ignore — the style's own filter, and the class test beside it.
            map.setFilter(layer.id, ['all', own, transitOnly]);
        }
        // poi_transit is left alone: its filter already admits only transit classes.
    }
}
