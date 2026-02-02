import type { StyleSpecification } from "maplibre-gl";

export const satMapStyle: StyleSpecification = {
    version: 8,
    sources: {
        'esri-world': {
            type: "raster",
            tiles: ['https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
            attribution: "Esri, Maxar, Earthstar Geographics, and the GIS User Community"
        }
    },
    layers: [{
        id: "imagery-raster",
        type: "raster",
        source: "esri-world"
    }],
    "sprite": "https://tiles.openfreemap.org/sprites/ofm_f384/ofm",
    "glyphs": "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf"
};

export async function mixinToStyle(url: string, mixin: (style: StyleSpecification) => StyleSpecification) {
    return mixin(await fetch(url).then(r => r.json()));
}