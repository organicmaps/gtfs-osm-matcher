/**
 * @typedef {Object} StopMatch
 * @property {string} id
 * @property {OsmStop} osmStop
 * @property {GTFSStop} gtfsStop
 * @property {Object} codeMatch
 */

import { GTFSRoute, GTFSStop } from "../models/GTFSData";
import { OsmRoute } from "../models/OsmRoute";
import OsmStop from "../models/OsmStop";

export type StopMatch = {
    id: string
    osmStop?: OsmStop
    gtfsStop?: GTFSStop
    codeMatch?: {
        stopPosition: boolean
        platform: boolean
    }
};

export type RouteMatchType = {
    osmRoute?: OsmRoute
    gtfsRoute?: GTFSRoute
};

export type MatchSettingsType = {
    refTag: string
    matchByName: boolean
    matchByCodeInName: boolean
};
