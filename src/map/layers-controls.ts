import type { FilterSpecification, GeoJSONSource, GeoJSONSourceSpecification, LayerSpecification, Map, SourceSpecification, StyleSpecification } from "maplibre-gl";

export type StyleMap = {
    [key: string]: StyleSpecification | string
}

export type OverlaySpecification = {
    layers: LayerSpecification[],
    sources: {
        [key: string]: SourceSpecification
    }
}

/**
 * A registered overlay. addOverlayImmediate returns this handle, and it is all a
 * component needs to keep its overlay working: update data and filters, or take the
 * overlay off the map. The spec itself stays with LayerControls.
 */
export type Overlay = {
    /**
     * Replaces a GeoJSON source's data. The data is written both to the map (drawn
     * now) and to the stored spec, so that a base-style switch redraws what is on
     * screen instead of the data the spec was declared with.
     */
    setSourceData(sourceId: string, data: GeoJSONSourceSpecification['data']): void;

    /** Same as setSourceData, but for a layer's filter. */
    setLayerFilter(layerId: string, filter: FilterSpecification): void;

    /** Removes the overlay's layers and sources from the map and forgets it. */
    remove(): void;
}

type OverlayEntry = {
    spec: OverlaySpecification,
    handle: Overlay,
}

export class LayerControls {
    stylesResolved = false;
    overlays: OverlayEntry[] = [];
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

    /**
     * Registers an overlay and draws it on the current style. The returned handle is
     * how the caller updates or removes it later.
     *
     * Calling this again with the same spec returns the already registered overlay
     * instead of drawing a second copy: components mount and unmount as panels open
     * and close, while their overlay may stay on the map.
     */
    addOverlayImmediate(spec: OverlaySpecification): Overlay {
        const registered = this.overlays.find(entry => entry.spec === spec);
        if (registered) {
            return registered.handle;
        }

        const handle: Overlay = {
            setSourceData: (sourceId, data) => this.updateSourceData(spec, sourceId, data),
            setLayerFilter: (layerId, filter) => this.updateLayerFilter(spec, layerId, filter),
            remove: () => this.removeOverlay(spec),
        };
        this.overlays.push({ spec, handle });

        for (const [key, source] of Object.entries(spec.sources)) {
            if (!this.map.getSource(key)) {
                this.map.addSource(key, source);
            }
        }

        for (const layer of spec.layers) {
            if (!this.map.getLayer(layer.id)) {
                this.map.addLayer(layer);
            }
        }

        return handle;
    }

    private updateSourceData(spec: OverlaySpecification, sourceId: string,
        data: GeoJSONSourceSpecification['data']) {

        const stored = spec.sources[sourceId];
        if (!stored || stored.type !== 'geojson') {
            console.warn(`Overlay has no GeoJSON source "${sourceId}"`);
            return;
        }
        stored.data = data;

        const live = this.map.getSource(sourceId);
        if (live && live.type === 'geojson') {
            (live as GeoJSONSource).setData(data);
        }
    }

    private updateLayerFilter(spec: OverlaySpecification, layerId: string, filter: FilterSpecification) {
        const layer = spec.layers.find(l => l.id === layerId);
        if (!layer || !('filter' in layer)) {
            console.warn(`Overlay has no filterable layer "${layerId}"`);
            return;
        }
        layer.filter = filter;

        if (this.map.getLayer(layerId)) {
            this.map.setFilter(layerId, filter);
        }
    }

    private removeOverlay(spec: OverlaySpecification) {
        const entry = this.overlays.find(e => e.spec === spec);
        if (!entry) {
            return;
        }
        this.overlays = this.overlays.filter(e => e !== entry);

        for (const layer of spec.layers) {
            if (this.map.getLayer(layer.id)) {
                this.map.removeLayer(layer.id);
            }
        }

        for (const key of Object.keys(spec.sources)) {
            if (this.map.getSource(key)) {
                this.map.removeSource(key);
            }
        }
    }

    /**
     * Switches the base style. Every registered overlay is put back on top of it from
     * its own spec, as that spec stands right now, so the switch does not lose
     * anything drawn.
     */
    async setBaseStyle(styleKey: string) {
        await this.resolveStyles();

        // The base styles held as URLs have been resolved to specifications by now.
        const base = this.baseLayerStyles[styleKey] as StyleSpecification;

        var fullStyle = {
            ...base
        }

        for (const { spec } of this.overlays) {
            fullStyle.sources = {
                ...fullStyle.sources,
                ...spec.sources
            };
            fullStyle.layers = [
                ...fullStyle.layers,
                ...spec.layers
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
