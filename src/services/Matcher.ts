//@ts-check

import KDBush from 'kdbush';
import GTFSData, { GTFSStop } from '../models/GTFSData';
import { OsmRoute } from '../models/OsmRoute';
import OsmStop from '../models/OsmStop';
import { MatchSettingsType, RouteMatchType, StopMatch } from './Matcher.types';
import OSMData from './OSMData';
import { OSMElement, OSMRelation } from './OSMData.types';

// Meters
const SEARCH_RADIUS = 500;

export const ROUTE_TYPES = [
    'public_transport', 'bus', 'tram',
    'light_rail', 'ferry', 'trolleybus'
];

function parseStopsFromOSMData(osmData: OSMData) {
    const hwBusStop = osmData.elements.filter(e => e.tags)
        .filter(e => e.tags['highway'] === 'bus_stop' || e.tags['public_transport'] === 'platform');

    return hwBusStop.map(e => {
        try {
            return new OsmStop(undefined, e);
        }
        catch (err) {
            console.error('Failed to create OsmStop for', e);
            return undefined;
        }
    });
}

export class StopMatchData {
    
    settings: MatchSettingsType
    matched: StopMatch[]
    unmatchedGtfs: StopMatch[]
    unmatchedOsm: StopMatch[]
    
    matchByGtfsId: {[gtfsStopId: string]: StopMatch}
    matchByOSMId: {[osmStopId: string]: StopMatch}

    constructor(settings: MatchSettingsType, gtfsData: GTFSData, osmData: OSMData) {
        this.settings = {
            ...settings
        };

        this.matched = [];
        this.unmatchedGtfs = [];
        this.unmatchedOsm = [];

        this._runMatch(gtfsData, osmData);

        this.matchByGtfsId = {};
        [...this.matched, ...this.unmatchedGtfs].forEach(match => {
            if (match.gtfsStop) {
                this.matchByGtfsId[match.gtfsStop.id] = match;
            }
        });

        this.matchByOSMId = {};
        [...this.matched, ...this.unmatchedOsm].forEach(match => {
            if (match.osmStop) {
                const platform = match.osmStop.platform;
                if (platform) {
                    this.matchByOSMId[`${platform.type[0]}${platform.id}`] = match;
                }

                const stopPosition = match.osmStop.stopPosition;
                if (stopPosition) {
                    this.matchByOSMId[`${stopPosition.type[0]}${stopPosition.id}`] = match;
                }
            }
        });
    }

    _runMatch(gtfsData: GTFSData, osmData: OSMData) {

        const osmStops = parseStopsFromOSMData(osmData);

        const indexEntries = osmStops.map(stop => ({
                stop,
                point: stop?.getPosition3857()
            }))
            .filter(entry => entry.point && entry.stop);


        const stopsIndex = new KDBush(indexEntries.length);
        indexEntries.forEach(({point}) => {point && stopsIndex.add(point.x, point.y)})

        stopsIndex.finish();

        const refTag = this.settings.refTag;

        const matchedOsmStops = new Set();

        gtfsData.stops.forEach(gtfsStop => {
            const surroundOsmStops = stopsIndex
                .within(gtfsStop.position.x, gtfsStop.position.y, SEARCH_RADIUS)
                .map(i => indexEntries[i].stop) as OsmStop[];

            const match = surroundOsmStops ? findMatch(gtfsStop, surroundOsmStops, refTag) : undefined;

            if (match) {
                this.matched.push(match);
                matchedOsmStops.add(match.osmStop);
            }
            else {
                this.unmatchedGtfs.push({
                    id: gtfsStop.id,
                    gtfsStop: gtfsStop,
                    osmStop: undefined
                });
            }
        });

        osmStops
            .filter(s => !matchedOsmStops.has(s))
            .forEach(osmStop => this.unmatchedOsm.push({
                id: osmStop!.getId(),
                osmStop
            }));
        
    }

    setMatch(match: StopMatch, osmStop: OsmStop) {
        const gtfsStop = match.gtfsStop;
        const code = gtfsStop!.code;

        const {platform, stopPosition} = osmStop;

        const platformMatch = platform && checkCodeForElement(platform, this.settings.refTag, code);
        const pstopPositionMatch = stopPosition && checkCodeForElement(stopPosition, this.settings.refTag, code);

        if (platformMatch || pstopPositionMatch) {
            match.codeMatch = {
                platform: !!platformMatch,
                stopPosition: !!pstopPositionMatch,
            };
            match.osmStop = osmStop;
            
            this.matched.push(match);
            this.unmatchedGtfs = this.unmatchedGtfs.filter(m => m.gtfsStop!.id !== match.gtfsStop!.id);

            return true;
        }

        return false;
    }

    setMatchToMatch(match: StopMatch, assignedMatch: StopMatch) {
        const osmStop = assignedMatch.osmStop;

        if (!match.gtfsStop || !osmStop) {
            return false;
        }

        if (this.setMatch(match, osmStop)) {
            this.unmatchedGtfs = this.unmatchedGtfs.filter(m => m.gtfsStop!.id !== match.gtfsStop!.id);
            
            this.unmatchedOsm = this.unmatchedOsm.filter(m => m.osmStop !== osmStop);

            return true;
        }

        return false;
    }

    findMatchByOsmElementTypeAndId(type: string, id: number) {
        return this.matchByOSMId[`${type[0]}${id}`];
    }
}

function findMatch(gtfsStop: GTFSStop, surroundOsmStops: OsmStop[], refTag: string) {
    for (const osmStop of surroundOsmStops) {

        const code = gtfsStop.code;

        const platform = osmStop.platform && checkCodeForElement(osmStop.platform, refTag, code);
        const stopPosition = osmStop.stopPosition && checkCodeForElement(osmStop.stopPosition, refTag, code);
        
        if (platform || stopPosition) {
            return {
                id: gtfsStop.id,
                osmStop,
                gtfsStop,
                codeMatch: {
                    platform,
                    stopPosition
                }
            } as StopMatch
        }
    }
}
/**
 * Parse routes from osm data
 */
export function listRouteRelationsOSMData(osmData: OSMData) {
    const relations = osmData.elements
        .filter(e => e.type === 'relation');

    return relations.filter(e => e.tags).filter(e => {
        return e.tags['type'] === 'route' &&
            ROUTE_TYPES.includes(e.tags['route']);
    });
}

export class RoutesMatch {

    matched: RouteMatchType[]
    unmatchedGtfs: RouteMatchType[]
    unmatchedOsm: RouteMatchType[]
    
    settings: MatchSettingsType
    
    osmRoutes: OsmRoute[]
    noRefRelations: OSMRelation[]
    
    constructor(settings: MatchSettingsType, gtfsData: GTFSData, osmData: OSMData, stopsMatch: StopMatchData) {

        this.settings = {
            ...settings
        };

        this.osmRoutes = [];
        
        this.matched = [];
        this.unmatchedGtfs = [];
        this.unmatchedOsm = [];
        this.noRefRelations = [];

        this._runMatch(gtfsData, osmData, stopsMatch);
    }

    // TODO: Check for matched stops inside matched or unmatched
    // routes and trips

    // @ts-ignore stopsMatch newer read locally
    _runMatch(gtfsData: GTFSData, osmData: OSMData, stopsMatch: StopMatchData) {
        const routeRelations = listRouteRelationsOSMData(osmData);
        const refTag = this.settings.refTag;

        const ref2Rel = new Map();

        routeRelations.forEach(rel => {
            const ref = rel.tags[refTag] || rel.tags['ref'];
            if (ref) {
                if (!ref2Rel.has(ref)) {
                    ref2Rel.set(ref, []);
                }

                ref2Rel.get(ref).push(rel);
            }
            else {
                this.noRefRelations.push(rel as OSMRelation);
            }
        });

        const osmRouteByRef = new Map();
        for (const [ref, relations] of ref2Rel.entries()) {
            const osmRoute = new OsmRoute(ref, relations);
            osmRouteByRef.set(ref, osmRoute);
            this.osmRoutes.push(osmRoute);
        }

        Object.values(gtfsData.routes).forEach(gtfsRoute => {
            const osmRoute = osmRouteByRef.get(gtfsRoute.id);
            if (osmRoute) {
                this.matched.push({
                    osmRoute,
                    gtfsRoute,
                });
            }
            else {
                this.unmatchedGtfs.push({gtfsRoute});
            }
        });

        const matchedIds = this.matched.map(m => m.gtfsRoute!.id);
        for (let [ref, osmRoute] of osmRouteByRef.entries()) {
            if (!matchedIds.includes(ref)) {
                this.unmatchedOsm.push({osmRoute});
            }
        }
    }
}

function checkCodeForElement(osmElement: OSMElement, refTag: string, code: string) {
    if (osmElement && osmElement.tags) {
        return osmElement.tags[refTag] === code;
    }

    return false;
}
