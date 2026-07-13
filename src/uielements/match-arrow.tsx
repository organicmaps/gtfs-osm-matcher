import { useContext, useEffect } from "preact/hooks";
import { MapContext } from "../app";
import { loadSvgWithColors } from "../map/map";

type OsmPoint = {
    lon: number;
    lat: number;
};

type MatchArrowLayerProps = {
    gtfsLon: number;
    gtfsLat: number;
    osmPoints: OsmPoint[];
    visible: boolean;
};

const ARROW_IMG_ID = 'match-arrow-green';
const SOURCE_ID = 'match-arrows';
const LINE_LAYER_ID = 'match-arrows-line';
const SYMBOL_LAYER_ID = 'match-arrows-symbol';

export function MatchArrowLayer({ gtfsLon, gtfsLat, osmPoints, visible }: MatchArrowLayerProps) {
    const mapContext = useContext(MapContext);
    const map = mapContext?.map;
    const mapLoaded = mapContext?.loaded;
    const layerControls = mapContext?.layerControls;

    useEffect(() => {
        if (!map || !layerControls || !visible || osmPoints.length === 0) return;

        const points = osmPoints.filter(p => !isNaN(p.lon) && !isNaN(p.lat));
        if (points.length === 0) return;

        const lineFeatures = points.map(p => ({
            type: 'Feature',
            geometry: {
                type: 'LineString',
                coordinates: [[gtfsLon, gtfsLat], [p.lon, p.lat]]
            },
            properties: {}
        }));

        const overlay = {
            sources: {
                [SOURCE_ID]: {
                    type: 'geojson',
                    data: { type: 'FeatureCollection', features: lineFeatures }
                }
            },
            layers: [
                {
                    id: LINE_LAYER_ID,
                    type: 'line',
                    source: SOURCE_ID,
                    layout: {
                        'line-join': 'round',
                        'line-cap': 'round',
                    },
                    paint: {
                        'line-color': 'green',
                        'line-width': 5
                    }
                },
                {
                    id: SYMBOL_LAYER_ID,
                    type: 'symbol',
                    source: SOURCE_ID,
                    layout: {
                        'symbol-placement': 'line-center',
                        'icon-image': ARROW_IMG_ID,
                        'icon-size': 1.5,
                    }
                }
            ]
        };

        const subscription = { canceled: false, promiseFulfiled: false };

        mapLoaded?.then(async m => {
            if (!m.hasImage(ARROW_IMG_ID)) {
                const img = await loadSvgWithColors("/arrow.svg", {
                    'path': ['fill', 'green']
                });
                if (!m.hasImage(ARROW_IMG_ID)) {
                    m.addImage(ARROW_IMG_ID, img);
                }
            }

            subscription.promiseFulfiled = true;
            if (subscription.canceled) return;

            // @ts-ignore
            layerControls.addOverlayImmediate(overlay);
        });

        return () => {
            subscription.canceled = true;
            if (subscription.promiseFulfiled) {
                // @ts-ignore
                layerControls.removeOverlayImmediate(overlay);
            }
        };
    }, [map, layerControls, mapLoaded, visible, gtfsLon, gtfsLat, osmPoints]);

    return <></>;
}
