import { useContext, useEffect, useMemo } from "preact/hooks";
import { MapContext } from "../app";
import type { Report } from "./report";

const BBOX_SOURCE = 'region-bbox';
const BBOX_FILL_LAYER = 'region-bbox-fill';
const BBOX_LINE_LAYER = 'region-bbox-line';

const MARKERS_SOURCE = 'region-markers';
const CLUSTERS_LAYER = 'region-markers-clusters';
const CLUSTER_COUNT_LAYER = 'region-markers-cluster-count';
const CIRCLES_LAYER = 'region-markers-circles';
const LABELS_LAYER = 'region-markers-labels';

type Props = {
    reports: Report[];
    onSelectReport?: (region: string | null) => void;
}

export function RegionMarkersLayer({ reports, onSelectReport }: Props) {
    const mapContext = useContext(MapContext);
    const map = mapContext?.map;
    const mapLoaded = mapContext?.loaded;
    const stylingControls = mapContext?.layerControls;

    const withBbox = useMemo(
        () => reports.filter(r => r.matchMeta?.gtfsBbox),
        [reports]
    );

    // Polygon rectangles matching each region's bounding box
    const bboxGeojson = useMemo(() => ({
        type: 'FeatureCollection' as const,
        features: withBbox.map(r => {
            const { left, right, top, bottom } = r.matchMeta.gtfsBbox!;
            // 'top' is south lat, 'bottom' is north lat in this dataset
            return {
                type: 'Feature' as const,
                geometry: {
                    type: 'Polygon' as const,
                    coordinates: [[
                        [left, top],
                        [right, top],
                        [right, bottom],
                        [left, bottom],
                        [left, top],
                    ]]
                },
                properties: { region: r.region }
            };
        })
    }), [withBbox]);

    // Center-point markers for click targets and labels
    const markersGeojson = useMemo(() => ({
        type: 'FeatureCollection' as const,
        features: withBbox.map(r => {
            const { left, right, top, bottom } = r.matchMeta.gtfsBbox!;
            return {
                type: 'Feature' as const,
                geometry: {
                    type: 'Point' as const,
                    coordinates: [(left + right) / 2, (top + bottom) / 2]
                },
                properties: { region: r.region }
            };
        })
    }), [withBbox]);

    useEffect(() => {
        if (!map || !stylingControls || !mapLoaded) return;

        const overlayStyle = {
            sources: {
                [BBOX_SOURCE]: {
                    type: 'geojson' as const,
                    data: bboxGeojson,
                    promoteId: 'region',
                },
                [MARKERS_SOURCE]: {
                    type: 'geojson' as const,
                    data: markersGeojson,
                    promoteId: 'region',
                    cluster: true,
                    clusterMaxZoom: 5,
                    clusterRadius: 40,
                },
            },
            layers: [
                {
                    id: BBOX_FILL_LAYER,
                    type: 'fill' as const,
                    source: BBOX_SOURCE,
                    paint: {
                        'fill-color': '#2c2ca5',
                        'fill-opacity': ['case',
                            ['boolean', ['feature-state', 'hover'], false],
                            0.2,
                            0,
                        ] as any,
                    }
                },
                {
                    id: BBOX_LINE_LAYER,
                    type: 'line' as const,
                    source: BBOX_SOURCE,
                    paint: {
                        'line-color': '#2c2ca5',
                        'line-width': 2.5,
                        'line-opacity': ['case',
                            ['boolean', ['feature-state', 'hover'], false],
                            0.8,
                            0,
                        ] as any,
                    }
                },
                // Cluster circles
                {
                    id: CLUSTERS_LAYER,
                    type: 'circle' as const,
                    source: MARKERS_SOURCE,
                    filter: ['has', 'point_count'] as any,
                    paint: {
                        'circle-color': '#2c2ca5',
                        'circle-opacity': 0.85,
                        'circle-stroke-width': 2,
                        'circle-stroke-color': '#fff',
                        'circle-radius': ['step', ['get', 'point_count'],
                            14,   // radius for < 5
                            5,  18,   // radius for < 20
                            20, 22,   // radius for >= 20
                        ] as any,
                    }
                },
                // Cluster count labels
                {
                    id: CLUSTER_COUNT_LAYER,
                    type: 'symbol' as const,
                    source: MARKERS_SOURCE,
                    filter: ['has', 'point_count'] as any,
                    layout: {
                        'text-field': ['get', 'point_count_abbreviated'] as any,
                        'text-size': 12,
                        'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'] as any,
                    },
                    paint: {
                        'text-color': '#fff',
                    }
                },
                // Individual (unclustered) circles — on top
                {
                    id: CIRCLES_LAYER,
                    type: 'circle' as const,
                    source: MARKERS_SOURCE,
                    filter: ['!', ['has', 'point_count']] as any,
                    paint: {
                        'circle-radius': ['case',
                            ['boolean', ['feature-state', 'hover'], false],
                            11,
                            7,
                        ] as any,
                        'circle-color': ['case',
                            ['boolean', ['feature-state', 'hover'], false],
                            '#1a1a8c',
                            '#2c2ca5',
                        ] as any,
                        'circle-stroke-width': 2,
                        'circle-stroke-color': '#fff',
                        'circle-opacity': ['case',
                            ['boolean', ['feature-state', 'hover'], false],
                            1,
                            0.85,
                        ] as any,
                    }
                },
                // Individual point labels — topmost
                {
                    id: LABELS_LAYER,
                    type: 'symbol' as const,
                    source: MARKERS_SOURCE,
                    filter: ['!', ['has', 'point_count']] as any,
                    layout: {
                        'text-field': ['get', 'region'] as any,
                        'text-size': 12,
                        'text-offset': [0, 0.75] as any,
                        'text-anchor': 'top' as const,
                    },
                    paint: {
                        'text-halo-color': '#fff',
                        'text-halo-width': 2,
                    }
                }
            ]
        };

        const handleClick = (e: any) => {
            // Clusters: zoom to expand
            const clusterFeatures = map.queryRenderedFeatures(e.point, { layers: [CLUSTERS_LAYER] });
            if (clusterFeatures.length > 0) {
                const clusterId = clusterFeatures[0].id as number;
                const source = map.getSource(MARKERS_SOURCE) as any;
                source.getClusterExpansionZoom(clusterId, (err: any, zoom: number) => {
                    if (err) return;
                    map.easeTo({
                        center: (clusterFeatures[0].geometry as any).coordinates,
                        zoom,
                    });
                });
                return;
            }

            const circleFeatures = map.queryRenderedFeatures(e.point, { layers: [CIRCLES_LAYER] });
            const region = circleFeatures[0]?.properties?.region;
            if (region) {
                window.location.hash = `#/match-report/${region}`;
                onSelectReport?.(region);
            }
        };

        let hoveredRegion: string | null = null;

        const setHover = (region: string | null) => {
            if (hoveredRegion) {
                map.setFeatureState({ source: BBOX_SOURCE, id: hoveredRegion }, { hover: false });
                map.setFeatureState({ source: MARKERS_SOURCE, id: hoveredRegion }, { hover: false });
            }
            hoveredRegion = region;
            if (hoveredRegion) {
                map.setFeatureState({ source: BBOX_SOURCE, id: hoveredRegion }, { hover: true });
                map.setFeatureState({ source: MARKERS_SOURCE, id: hoveredRegion }, { hover: true });
            }
        };

        const handleMouseMove = (e: any) => {
            // Clusters get pointer cursor but no region hover
            const clusterFeatures = map.queryRenderedFeatures(e.point, { layers: [CLUSTERS_LAYER] });
            if (clusterFeatures.length > 0) {
                map.getCanvas().style.cursor = 'pointer';
                if (hoveredRegion !== null) setHover(null);
                return;
            }

            const circleFeatures = map.queryRenderedFeatures(e.point, { layers: [CIRCLES_LAYER] });
            const region = circleFeatures[0]?.properties?.region ?? null;
            map.getCanvas().style.cursor = region ? 'pointer' : '';
            if (region !== hoveredRegion) {
                setHover(region);
            }
        };

        const handleMouseLeave = () => {
            map.getCanvas().style.cursor = '';
            setHover(null);
        };

        const subscription = { canceled: false, promiseFulfilled: false };

        mapLoaded.then(map => {
            subscription.promiseFulfilled = true;
            if (!subscription.canceled) {
                stylingControls.addOverlayImmediate(overlayStyle);
                map.on('click', handleClick);
                map.on('mousemove', handleMouseMove);
                map.on('mouseout', handleMouseLeave);
            }
        });

        return () => {
            subscription.canceled = true;
            if (subscription.promiseFulfilled) {
                stylingControls.removeOverlayImmediate(overlayStyle);
                map.off('click', handleClick);
                map.off('mousemove', handleMouseMove);
                map.off('mouseout', handleMouseLeave);
            }
        };
    }, [map, stylingControls, mapLoaded, bboxGeojson, markersGeojson, onSelectReport]);

    return <></>;
}
