import "./selection-info.css";

import { useCallback, useEffect, useMemo, useState } from "preact/hooks";
import { type SelectionT } from "../app";

import { getDistanceLonLat } from "../map/distance";
import { LocateMe } from "./locate-me";
import { TagEditor } from "./editor/osm-tags";

import { cls } from "./cls";
import { RoutesMap } from "./routes";
import { OSM_DATA } from "../services/OSMData";
import { useSyncExternalStore } from "preact/compat";
import { getTileXYZ } from "../services/tile-utils";
import { HtmlMapMarker } from "./editor/map-marker";
import { AddOsmStopController } from "./editor/add-stop-controller";
import { MoveController } from "./editor/move-stop-controller";
import { OSM_QUERY_QUEUE } from "../services/OsmQuerryQueue";


const importantTagsRg = /(name|ref|gtfs|bus|train|tram|trolleybus|ferry|station|platform|public_transport)/;

const ABC = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

export type SelectionInfoProps = {
    selection: SelectionT | null
}
export function SelectionInfo({ selection }: SelectionInfoProps) {
    const properties = selection?.feature.properties;
    const datasetName = selection?.datasetName;
    const reportRegion = selection?.reportRegion;
    const idTags = selection?.idTags;

    const geometry = selection?.feature.geometry;

    return (<>
        <div id={"selection-info"} className={cls(!selection && "hidden")}>
            {properties && reportRegion &&
                <MatchInfo {...{ datasetName, properties, geometry, reportRegion, idTags }} />}
        </div>
    </>
    )
}


type MatchInfoProps = {
    properties: { [k: string]: any }
    geometry: GeoJSON.Geometry | undefined
    reportRegion: string
    datasetName?: string
    idTags?: { [k: string]: number }
}
function MatchInfo({ datasetName, properties, geometry, idTags }: MatchInfoProps) {

    const [loading, setLoading] = useState(false);

    const name = properties?.['gtfsStopName'] || properties?.['name'];

    const idTagsStatistics = idTags || {};

    //@ts-ignore
    const [lon, lat] = geometry?.coordinates || [];

    const gtfsFeatures = useMemo(() => getGtfsFeatures(properties), [properties]);
    const osmFeatures = useMemo(() => parseJsonSafe(properties['osmFeatures'], []), [properties]);
    const routes = useMemo(() => parseJsonSafe(properties['gtfsRoutes'], null), [properties]);

    if (import.meta.env.DEV) {
        console.log('render selection', {
            name,
            lonLat: [lon, lat],
            idTagsStatistics,
            gtfsFeatures,
            osmFeatures,
            routes,
            propertyKeys: Object.keys(properties)
        });
    }

    const tagActions: TagActionsT = {
        setName: ['name', name] as [string, string]
    };

    const gtfsIdTag = Object.entries(idTagsStatistics || {}).map(([k, _cnt]) => k).filter(k => k !== 'name')[0] || 'ref:gtfs';

    if (properties.gtfsStopId) {
        tagActions.setId = [gtfsIdTag, properties.gtfsStopId] as [string, string];
    }

    if (properties.gtfsStopCode && properties.gtfsStopCode != 'null' && properties.gtfsStopCode.length > 0) {
        tagActions.setCode = [gtfsIdTag, properties.gtfsStopCode] as [string, string];
    }

    // For single gtfs stop display routes is a property 
    // of the subject feature
    // For clusetrs routes are a property of gtfs features
    const routesDisplayEntries = routes ?
        [{ stopLonLat: [lon, lat], routes }] :
        gtfsFeatures.map((f: any) => ({ stopLonLat: [f.lon, f.lat], routes: f.gtfsRoutes }));

    const routeTypes = properties.gtfsRouteTypes;

    const gtfsLi = gtfsFeatures.map((f: any) => {
        const gtfsRoutes = f.gtfsRoutes;
        return (
            <li key={f.id}>
                <span>{f.id}</span>
                {f.code && <span> code: {f.code}</span>}

                <div>
                    {gtfsRoutes && <div className="routes"><b>Routes: </b>
                        {Object.entries(gtfsRoutes || {}).map(([routeId, _route]) =>
                            <span key={routeId}>{routeId} </span>
                        )}
                    </div>}
                </div>

            </li>
        );
    });

    const markersGtfs = gtfsFeatures.map((f: any, i: number) =>
        <HtmlMapMarker key={f.id} name={"gtfs " + letterCode(i)} lon={f.lon} lat={f.lat} />);

    return (<div>
        <h2>{name}</h2>

        <DatasetHelp datasetName={datasetName} />

        {gtfsFeatures.length === 1 && <div>
            <div>Gtfs stop Id: <b>{properties.gtfsStopId}</b></div>
            <div>Gtfs stop Code: {properties.gtfsStopCode ? <b>{properties.gtfsStopCode}</b> : <i>N/A</i>}</div>
        </div>}

        {idTagsStatistics &&
            <div>Id or Code osm tags: {Object.entries(idTagsStatistics)
                .map(([tag, count]) => <span key={tag}><b>{tag}</b> ({count}) </span>)}</div>
        }

        {gtfsFeatures.length > 1 && <div>
            <h4>Gtfs Feautures</h4>
            <ol type="A">
                {gtfsLi}
            </ol>
            {markersGtfs}
        </div>}

        <RoutesMap entries={routesDisplayEntries} />

        <div>
            {(properties.gtfsRouteTypes?.length || 0) > 0 &&
                <div>Gtfs route types: <b>{properties.gtfsRouteTypes}</b></div>
            }
            {routes && <div><b>Routes: </b>
                {Object.entries(routes || {}).map(([routeId, _route]) =>
                    <span key={routeId}>{routeId} </span>
                )}
            </div>}
        </div>

        <div className={"edit-actions"}>
            <AddOsmStopController id={properties.gtfsStopId} code={properties.gtfsStopCode} routeTypes={routeTypes} {...{ name, idTags }} />
        </div>

        {loading && <div>Loading OSM data...</div>}

        <OsmElements setLoading={setLoading} osmFeatures={osmFeatures} tagActions={tagActions} parentLonLat={[lon, lat]} />

    </div>)
}

function useOsmFeatures() {
    return useSyncExternalStore((sub) => {
        OSM_DATA.dataUpdated = sub;
        return () => {
            OSM_DATA.dataUpdated = () => { };
        }
    }, () => OSM_DATA.elements);
}

function getGtfsFeatures(properties: { [k: string]: any }) {
    if (properties.gtfsFeatures) {
        return parseJsonSafe(properties.gtfsFeatures, []);
    }

    return [{
        id: properties.gtfsStopId,
        code: properties.gtfsStopCode,
        lon: properties.lon,
        lat: properties.lat
    }];
}

type TagActionsT = {
    setName: [string, string];
    setId?: [string, string];
    setCode?: [string, string];
}

interface OsmElementsProps {
    osmFeatures: any[];
    parentLonLat: number[];
    tagActions?: TagActionsT;
    loading?: boolean;
    setLoading?: (loading: boolean) => void;
}
function OsmElements({ osmFeatures, parentLonLat, tagActions, setLoading }: OsmElementsProps) {

    const [highlightId, setHighlightId] = useState<string | null>(null);

    const handleHover = useCallback((id: string, hover: boolean) => {
        // Clear only our own highlight id
        setHighlightId((activeHl) => hover ? id : (activeHl === id ? null : activeHl));
    }, [setHighlightId]);

    const allOsmFeatures = useOsmFeatures();

    const missingOsmFeatures = useMemo(() => {
        import.meta.env.DEV &&
            console.log('Update osm features to load');
        return osmFeatures.filter(f => !OSM_DATA.getByNWRId(f.id));
    }, [osmFeatures, allOsmFeatures]);

    useEffect(() => {
        if (missingOsmFeatures.length > 0) {
            const nodes = missingOsmFeatures.filter(f => f.id[0] === 'n').map(f => f.id.substring(1));
            const ways = missingOsmFeatures.filter(f => f.id[0] === 'w').map(f => f.id.substring(1));

            (async () => {
                if (import.meta.env.DEV) {
                    console.log('Loading OSM data');
                }

                setLoading?.(true);

                await OSM_QUERY_QUEUE.queryDataByIds(nodes, ways);

                const tiles = missingOsmFeatures
                    .map(f => getTileXYZ(f.lat, f.lon, 16))
                    .filter((f, inx, arr) => arr.findIndex(t => t.x === f.x && t.y === f.y) === inx);

                await OSM_QUERY_QUEUE.queryStopsForTiles(tiles);

                setLoading?.(false);
            })();
        }
    }, [missingOsmFeatures, setLoading]);

    const overpassElements = allOsmFeatures
        .filter(e => e.tags && Object.keys(e.tags).length > 0)
        .filter(e => {
            const elLL = OSM_DATA.getLonLat(e);
            if (!elLL) {
                // I still want to show all elements that have tags 
                return true;
            }
            return elLL && getDistanceLonLat(elLL, parentLonLat as [number, number]) < 500
        })
        .filter(ovp =>
            !osmFeatures.some(f => f.id === `${ovp.type[0]}${ovp.id}`));

    const osmMapElements = overpassElements.map((f: any) => {
        return <HtmlMapMarker key={f.id}
            className={cls(highlightId === `${f.type[0]}${f.id}` && 'highlight')}
            name={f.id} lon={f.lon} lat={f.lat} />
    });

    const markersOsm = osmFeatures.map((f: any, i: number) => {
        var lonLat = [f.lon, f.lat];

        const updF = OSM_DATA.getByNWRId(f.id);
        if (updF) {
            lonLat = OSM_DATA.getLonLat(updF)!;
        }

        return <HtmlMapMarker key={f.id} name={"osm " + letterCode(i)} lon={lonLat[0]} lat={lonLat[1]}
            className={cls(highlightId === f.id && 'highlight')}
        />
    });

    const osmLi = osmFeatures.map((f: any) =>
        <OsmListElement key={f.id} f={f}
            mouseEvents={{ onHoverUpdate: handleHover.bind(undefined, f.id) }}
            {...{ parentLonLat, tagActions }}
        />
    );

    const overpassLi = overpassElements.filter((f: any) => f.id > 0).map((f: any) => {
        const id = f.type[0] + f.id;
        return <OsmListElement key={id} f={{ ...f, id }}
            mouseEvents={{ onHoverUpdate: handleHover.bind(undefined, id) }}
            {...{ parentLonLat, tagActions }}
        />
    });

    const newOverpassLi = overpassElements.filter((f: any) => f.id < 0).map((f: any) => {
        const id = f.type[0] + f.id;
        return <OsmListElement key={id} f={{ ...f, id }} editDefault={true}
            mouseEvents={{ onHoverUpdate: handleHover.bind(undefined, id) }}
            {...{ parentLonLat, tagActions }}
        />
    });

    return (
        <div>
            {newOverpassLi.length > 0 && <>
                <h4>New OSM Feautures</h4>
                <div><i>This features were just created</i></div>
                <ul>
                    {newOverpassLi}
                </ul>
            </>}

            <h4>OSM Feautures</h4>
            <ol type="A">
                {osmLi}
            </ol>

            {overpassElements.length > 0 && <>
                <h4>Surrounding OSM Feautures</h4>
                <div><i>This features were not considered as match candidates during server matching</i></div>
                <ul>
                    {overpassLi}
                </ul>
            </>}

            {markersOsm}
            {osmMapElements}
        </div>
    )
}

export type HtmlMouseEventsHandlers = {
    onClick?: () => void;
    onMouseEnter?: () => void;
    onMouseLeave?: () => void;
};

export type MouseEventsHandlers = {
    onClick?: () => void;
    onHoverUpdate?: (hover: boolean) => void;
}

type OsmListElementProps = {
    f: any;
    parentLonLat: number[];
    editDefault?: boolean;
    tagActions?: TagActionsT;
    mouseEvents?: MouseEventsHandlers
};

function OsmListElement({ f, editDefault, parentLonLat, tagActions, mouseEvents }: OsmListElementProps) {

    const [edit, setEdit] = useState(editDefault || false);

    const [version, setVersion] = useState(0);

    const type = f.id[0] === 'n' ? 'node' : 'way';
    const idn = f.id.slice(1);

    const { onClick, onHoverUpdate } = mouseEvents || {};
    const mouseEventsHandler: HtmlMouseEventsHandlers = {};

    if (onClick) {
        mouseEventsHandler.onClick = () => onClick?.();
    }

    if (onHoverUpdate) {
        mouseEventsHandler.onMouseEnter = () => onHoverUpdate?.(true);
        mouseEventsHandler.onMouseLeave = () => onHoverUpdate?.(false);
    }

    const [lon, lat] = parentLonLat;

    const name = f.tags.name;

    const osmUrl = `https://osm.org/${type}/${idn}`;
    const osmHref = <a target="_blank" href={osmUrl}>{f.id}</a>;

    const matchSet = f.matchSet;

    const osmFeature = OSM_DATA.getByTypeAndId(type, idn);

    const tags = osmFeature?.tags || f.tags;

    const handleTagsChange = useCallback((tags: { [k: string]: string }) => {

        if (!osmFeature) {
            return;
        }

        OSM_DATA.setElementTags(tags, osmFeature);
    }, [osmFeature]);

    const handleSetName = useCallback(() => {
        const [key, value] = tagActions?.setName || [];
        import.meta.env.DEV && console.log('SetName', key, value);
        tagActions?.setName && handleTagsChange({ ...tags, [key!]: value });
        setVersion(v => v + 1);
    }, [handleTagsChange, tags, tagActions, setVersion]);

    const handleSetId = useCallback(() => {
        const [key, value] = tagActions?.setId || [];
        import.meta.env.DEV && console.log('SetId', key, value);
        tagActions?.setId && handleTagsChange({ ...tags, [key!]: value });
        setVersion(v => v + 1);
    }, [handleTagsChange, tags, tagActions, setVersion]);

    const handleSetCode = useCallback(() => {
        const [key, value] = tagActions?.setCode || [];
        import.meta.env.DEV && console.log('SetCode', key, value);
        tagActions?.setCode && handleTagsChange({ ...tags, [key!]: value });
        setVersion(v => v + 1);
    }, [handleTagsChange, tags, tagActions, setVersion]);

    const handleMove = useCallback((lonLat: number[]) => {
        if (!osmFeature) {
            return;
        }

        OSM_DATA.setNodeLatLng({ lng: lonLat[0], lat: lonLat[1] }, osmFeature);
    }, [osmFeature]);

    const alreadyMatchWarning = matchSet && matchSet !== 'no-match' &&
        <div className={'warning'}>
            <span>&#9888;</span>This OSM Element is already matched as {matchSet}
        </div>;

    const distanceInfo = lon && lat &&
        <span>
            ({getDistanceLonLat([lon, lat], [f.lon, f.lat]).toFixed(1)}m)
        </span>;

    return <li key={f.id} className="osm-list-item" {...mouseEventsHandler}>
        <b>{name} </b>
        <div>
            {osmHref} {distanceInfo}
            <SpanSpacer w={'10px'} />
            <LocateMe lonlatFeature={f} />
            <SpanSpacer w={'10px'} />
            <span>
                <label>Edit</label><input type="checkbox" checked={edit}
                    onChange={(e) => setEdit((e.target as HTMLInputElement).checked)} />
            </span>
        </div>
        {alreadyMatchWarning}

        {
            !(edit && osmFeature) ?
                <TagsTable tags={tags}
                    importantTagKeysRegex={importantTagsRg}
                    importantTagValuesRegex={importantTagsRg}
                /> :
                <TagEditor key={'tags_' + f.id + '_' + version} tags={tags}
                    tagsOriginal={f.tags} onChange={handleTagsChange}
                    importantTagKeysRegex={importantTagsRg}
                    importantTagValuesRegex={importantTagsRg} >

                    <div className={"tag-edit-actions"}>
                        {tagActions?.setName && <button onClick={handleSetName}>Set Name</button>}
                        {tagActions?.setId && <button onClick={handleSetId}>Set Id</button>}
                        {tagActions?.setCode && <button onClick={handleSetCode}>Set Code</button>}
                        <MoveController onMove={handleMove} />
                    </div>
                </TagEditor>
        }
    </li>
}

function SpanSpacer({ w }: { w: string }) {
    return <span style={{ display: 'inline-block', width: w }} />
}

function DatasetHelp({ datasetName }: { datasetName?: string }) {

    var info = (<i>One day here will be info text for {datasetName}</i>);

    if (datasetName === "no-match") {
        info = (<i>None of the OSM stops matched GTFS stop by Id, Name or Code</i>);
    }

    if (datasetName === "no-osm-stops") {
        info = (<i>Can't find any OSM element recognized as a Public transport stop in vicinity</i>);
    }

    if (datasetName === "match-id") {
        info = (<i>Matched OSM stops by GTFS Id or Code</i>);
    }

    if (datasetName === "match-name") {
        info = (<i>Matched OSM stops by GTFS stop Name</i>);
    }

    if (["clusters", "many-to-one", "transit-hub-clusters"].includes(datasetName || "")) {
        info = (<i>Multiple gtfs stops matched by name to the same group of OSM features.</i>);
    }

    return <p>{info}</p>
}


type TagsTableProps = {
    tags: {
        [k: string]: string
    },
    importantTagKeysRegex?: RegExp;
    importantTagValuesRegex?: RegExp;
}
function TagsTable({ tags, importantTagKeysRegex, importantTagValuesRegex }: TagsTableProps) {

    const rows = Object.entries(tags).map(([k, v]) => <tr key={k}>
        <td className={importantTagKeysRegex?.test(k) ? 'important' : ''}>{k}</td>
        <td className={importantTagValuesRegex?.test(v) ? 'important' : ''}>{v}</td>
    </tr>);

    return <table className={'tags-table'}>
        <tbody>
            {rows}
        </tbody>
    </table>
}


function parseJsonSafe(json: string | undefined, defValue: any) {
    if (json) {
        try {
            return JSON.parse(json);
        }
        catch (e) {
            console.warn(e);
        }
    }

    return defValue;
}

function letterCode(i: number) {
    return (ABC[i / ABC.length - 1] || '') + ABC[i % ABC.length];
}
