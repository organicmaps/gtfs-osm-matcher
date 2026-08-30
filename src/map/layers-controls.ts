import type { LayerSpecification, Map, SourceSpecification, StyleSpecification } from "maplibre-gl";

export type StyleMap = {
    [key: string]: StyleSpecification | string
}

export type OverlaySpecification = {
    layers: LayerSpecification[],
    sources: {
        [key: string]: SourceSpecification
    }
}


export class LayerControls {
    stylesResolved = false;
    overlays: OverlaySpecification[] = [];
    selectedStyleKey: string;
    map: Map;
    baseLayerStyles: StyleMap;

    constructor(map: Map, baseLayerStyles: StyleMap, selectedStyleKey?: string) {
        this.map = map;
        this.baseLayerStyles = baseLayerStyles;
        this.selectedStyleKey = selectedStyleKey || Object.keys(baseLayerStyles)[0];

        this.resolveStyles().then(() => {
            this.stylesResolved = true;
        });
    }

    // For now just keep overlays always visible.
    //
    // Idempotent, because `overlays` and the map are two registries and callers
    // guard on the map: RoutesMap adds `routesStyling` when `map.getSource` says
    // the source is absent, which it is for a moment while setStyle rebuilds.
    // Registering the same overlay twice makes setBaseStyle replay its layers
    // twice over one source -- the route line, its arrows and its labels all
    // drawn on top of themselves.
    addOverlayImmediate(overlayStyle: OverlaySpecification) {
        if (this.overlays.includes(overlayStyle)) {
            return;
        }
        this.overlays.push(overlayStyle);

        for (const [key, source] of Object.entries(overlayStyle.sources)) {
            if (!this.map.getSource(key)) {
                this.map.addSource(key, source);
            }
        }

        for (const layer of overlayStyle.layers) {
            if (!this.map.getLayer(layer.id)) {
                this.map.addLayer(layer);
            }
        }
    }

    removeOverlayImmediate(overlayStyle: OverlaySpecification) {
        this.overlays = this.overlays.filter(o => o !== overlayStyle);

        for (const layer of overlayStyle.layers) {
            if (this.map.getLayer(layer.id)) {
                this.map.removeLayer(layer.id);
            }
        }

        for (const key of Object.keys(overlayStyle.sources)) {
            if (this.map.getSource(key)) {
                this.map.removeSource(key);
            }
        }
    }

    async setBaseStyle(styleKey: string) {
        await this.resolveStyles();

        // At this moment baseLayerStyles urls are resolved to StyleSpecification
        const base = this.baseLayerStyles[styleKey] as StyleSpecification;

        var fullStyle = {
            ...base
        }

        for (const overlay of this.overlays) {
            fullStyle.sources = {
                ...fullStyle.sources,
                ...overlay.sources
            };
            fullStyle.layers = [
                ...fullStyle.layers,
                ...overlay.layers
            ];
        }

        this.selectedStyleKey = styleKey;
        this.map.setStyle(fullStyle);
    }

    cycleBaseStyle() {
        const keys = Object.keys(this.baseLayerStyles);
        const inx = keys.indexOf(this.selectedStyleKey);

        const nextKey = keys[(inx + 1) % keys.length];

        this.setBaseStyle(nextKey);

        return nextKey;
    }

    async resolveStyles() {
        if (this.stylesResolved) {
            return;
        }

        const shallowCopy = { ...this.baseLayerStyles };
        for (const [key, layerStyle] of Object.entries(shallowCopy)) {
            if (typeof layerStyle === 'string') {
                const resolved = await fetch(layerStyle).then(r => r.json());
                this.baseLayerStyles[key] = resolved;
            }
        }
    }
}