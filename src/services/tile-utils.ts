
export type TileXYZ = {
    x: number;
    y: number;
    z: number;
};

export type BBox = {
    north: number;
    south: number;
    east: number;
    west: number;
};

/**
 * Converts a longitude to a tile x coordinate at a given zoom level.
 * @param lon Longitude in degrees
 * @param zoom Zoom level
 * @returns Tile x coordinate
 */
export function lon2tile(lon: number, zoom: number): number {
    return (Math.floor((lon + 180) / 360 * Math.pow(2, zoom)));
}

/**
 * Converts a latitude to a tile y coordinate at a given zoom level.
 * @param lat Latitude in degrees
 * @param zoom Zoom level
 * @returns Tile y coordinate
 */
export function lat2tile(lat: number, zoom: number): number {
    return (Math.floor((1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * Math.pow(2, zoom)));
}

/**
 * Converts a tile x coordinate to a longitude at a given zoom level.
 * @param x Tile x coordinate
 * @param z Zoom level
 * @returns Longitude in degrees
 */
export function tile2lon(x: number, z: number): number {
    return (x / Math.pow(2, z) * 360 - 180);
}

/**
 * Converts a tile y coordinate to a latitude at a given zoom level.
 * @param y Tile y coordinate
 * @param z Zoom level
 * @returns Latitude in degrees
 */
export function tile2lat(y: number, z: number): number {
    var n = Math.PI - 2 * Math.PI * y / Math.pow(2, z);
    return (180 / Math.PI * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n))));
}

/**
 * Returns the tile coordinates for a given frequency.
 * @param lat Latitude in degrees
 * @param lon Longitude in degrees
 * @param zoom Zoom level
 * @returns Tile coordinates
 */
export function getTileXYZ(lat: number, lon: number, zoom: number): TileXYZ {
    const x = lon2tile(lon, zoom);
    const y = lat2tile(lat, zoom);
    return { x, y, z: zoom };
}

/**
 * Returns the bounding box for a given tile.
 * @param tile Tile
 * @returns Bounding box {north, south, east, west}
 */
export function getTileBBox(tile: TileXYZ): BBox {
    const { x, y, z } = tile;

    const north = tile2lat(y, z);
    const south = tile2lat(y + 1, z);
    const west = tile2lon(x, z);
    const east = tile2lon(x + 1, z);

    return { north, south, east, west };
}

