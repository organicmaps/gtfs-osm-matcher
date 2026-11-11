const JOSM_REMOTE_URL = 'http://127.0.0.1:8111';

const JOSM_LAYER_NAME = 'GTFS stop edits';

/**
 * Sends OSM XML to JOSM's Remote Control, loading it as a new layer.
 * Returns JOSM's HTTP status; fetch itself rejects when JOSM is unreachable.
 */
export async function loadInJosm(osmXml: string) {
    const response = await fetch(
        `${JOSM_REMOTE_URL}/load_data?new_layer=true&layer_name=${encodeURIComponent(JOSM_LAYER_NAME)}&data=${encodeURIComponent(osmXml)}`,
        { cache: 'no-store', redirect: 'error' },
    );

    return response.status;
}
