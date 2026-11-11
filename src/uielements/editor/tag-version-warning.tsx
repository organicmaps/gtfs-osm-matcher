const explanation = 'The server used an older version of OSM tags for matching. This tag differs in the latest Overpass data or was absent from the server report.';

export function TagVersionWarning() {
    return <span className="osm-tag-version-warning" role="img" tabIndex={0}
        aria-label={explanation}>⚠</span>;
}
