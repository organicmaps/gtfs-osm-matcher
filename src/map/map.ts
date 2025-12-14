import maplibregl, { Map } from "maplibre-gl";
import 'maplibre-gl/dist/maplibre-gl.css';
import { satMapStyle } from "./styling";
import { LayerControls } from "./layers-controls";

const DEFAULT_LOCATION = { zoom: 4, lat: 46.16, lon: -29.44 };

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

    const satb = document.getElementById('sat-button');
    if (satb) {
        satb.onclick = () => {
            const nextStyle = layerControls.selectedStyleKey === 'cartographic' ? 'satellite' : 'cartographic';
            layerControls.setBaseStyle(nextStyle);
        };
    }

    const mapLocationEl = document.createElement('div');
    mapLocationEl.id = "map-location";

    const locationInput = document.createElement('input');
    mapLocationEl.appendChild(locationInput);

    const osmHref = document.createElement('a');
    osmHref.target = "_blank";
    osmHref.innerText = "Goto OSM";
    osmHref.className = "goto-button";
    mapLocationEl.appendChild(osmHref);

    document.getElementById('app')?.appendChild(mapLocationEl);

    map.on('idle', () => {
        const hstr = mapHashString(map);
        locationInput.value = hstr;
        osmHref.href = `https://openstreetmap.org#map=${hstr}`;
        localStorage.setItem('map-location', hstr);
    });

    locationInput.onchange = (e: Event) => {
        const { zoom, lon, lat } = mapLocationFromHashString((e.target as HTMLInputElement).value);

        if (lon && !Number.isNaN(lon) && lat && !Number.isNaN(lat) && zoom) {
            map.setCenter([lon, lat]);
            map.setZoom(zoom);
        }

    };

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
