import { useCallback, useContext, useEffect, useState } from "preact/hooks";
import { MapContext, type SelectionT } from "../app";

import { Marker } from "maplibre-gl";
import { getDistanceLonLat } from "../map/distance";
import { LocateMe } from "./locate-me";
import { TagEditor } from "./editor/osm-tags";

const OSM_DATA = new OSMData();

import "./selection-info.css";
import { Routes } from "./routes";
import OSMData, { queryStops } from "../services/OSMData";
import { Changes } from "./editor/changes";
import { useSyncExternalStore } from "preact/compat";
import { getTileBBox, getTileXYZ } from "../services/tile-utils";
import { HtmlMapMarker } from "./editor/map-marker";
import { cls } from "./cls";


const importantTagsRg = /(name|ref|gtfs|bus|train|tram|ferry|station|platform|public_transport)/;

const ABC = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

export type SelectionInfoProps = {
    selection: SelectionT | null
}
export function SelectionInfo({ selection }: SelectionInfoProps) {

    const [showChanges, setShowChanges] = useState(false);
    const [loading, setLoading] = useState(false);
    const [edit, setEdit] = useState(false);

    const properties = selection?.feature.properties;
    const datasetName = selection?.datasetName;
    const reportRegion = selection?.reportRegion;
    const idTags = selection?.idTags;

    const geometry = selection?.feature.geometry;

    return (<>
        <div id={"selection-info"}>
            <div>
                <label>Show OSM changes</label>
                <input type="checkbox" checked={showChanges}
                    onChange={(e: Event) => setShowChanges((e.target as HTMLInputElement).checked)} />

                <label>Edit OSM data:</label>
                <input type="checkbox" checked={edit}
                    onChange={(e: Event) => setEdit((e.target as HTMLInputElement).checked)} />

                <div>
                    <label>Loading osm data: </label> <span className={cls("loading-indicator", loading && "spin")}>&#x1F5D8;</span>
                </div>

            </div>
            {showChanges && <Changes osmData={OSM_DATA} />}
            {properties && reportRegion &&
                <MatchInfo {...{ datasetName, properties, geometry, reportRegion, idTags, edit, setLoading }} />}
        </div>
    </>
    )
}


type MatchInfoProps = {
    properties: { [k: string]: any }
    geometry: GeoJSON.Geometry | undefined
    reportRegion: string
    edit: boolean
    setLoading?: (loading: boolean) => void
    datasetName?: string
    idTags?: { [k: string]: number }
}
function MatchInfo({ datasetName, properties, geometry, idTags, edit, setLoading }: MatchInfoProps) {

    const name = properties?.['gtfsStopName'] || properties?.['name'];

    const idTagsStatistics = idTags || {};

    //@ts-ignore
    const [lon, lat] = geometry?.coordinates || [];

    const gtfsFeatures = getGtfsFeatures(properties);
    const osmFeatures = parseJsonSafe(properties['osmFeatures'], []);
    const routes = parseJsonSafe(properties['gtfsRoutes'], null);

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

    if (properties.gtfsStopCode) {
        tagActions.setCode = [gtfsIdTag, properties.gtfsStopCode] as [string, string];
    }

    const gtfsLi = gtfsFeatures.map((f: any) => <li key={f.id}><span>{f.id}</span>{f.code && <span> code: {f.code}</span>}</li>);

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

        <Routes routes={routes} gtfsRouteTypes={properties.gtfsRouteTypes} stopLonLat={[lon, lat]} />

        <div className={"edit-actions"}>
            <AddOsmStopController id={properties.gtfsStopId} code={properties.gtfsStopCode} {...{ edit, name, idTags }} />
        </div>

        <OsmElements edit={edit} setLoading={setLoading} osmFeatures={osmFeatures} tagActions={tagActions} parentLonLat={[lon, lat]} />

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
    edit: boolean;
    osmFeatures: any[];
    parentLonLat: number[];
    tagActions?: TagActionsT;
    loading?: boolean;
    setLoading?: (loading: boolean) => void;
}
function OsmElements({ edit, osmFeatures, parentLonLat, tagActions, setLoading }: OsmElementsProps) {

    const [highlightId, setHighlightId] = useState<string | null>(null);

    const handleHover = useCallback((id: string, hover: boolean) => {
        // Clear only our own highlight id
        setHighlightId((activeHl) => hover ? id : (activeHl === id ? null : activeHl));
    }, [setHighlightId]);

    const missingOsmFeatures = osmFeatures.filter(f => !OSM_DATA.getByNWRId(f.id));

    useEffect(() => {
        if (missingOsmFeatures) {
            const nodes = missingOsmFeatures.filter(f => f.id[0] === 'n').map(f => f.id.substring(1));
            const ways = missingOsmFeatures.filter(f => f.id[0] === 'w').map(f => f.id.substring(1));

            (async () => {
                setLoading?.(true);
                if (nodes.length > 0) {
                    await fetch('https://api.openstreetmap.org/api/0.6/nodes.json?nodes=' + nodes.join(','))
                        .then(response => response.json())
                        .then(data => {
                            console.log('osm nodes data', data);
                            OSM_DATA.updateOverpassData(data);
                        });
                }

                if (ways.length > 0) {
                    await fetch('https://api.openstreetmap.org/api/0.6/ways.json?ways=' + ways.join(','))
                        .then(response => response.json())
                        .then(data => {
                            console.log('osm ways data', data);
                            OSM_DATA.updateOverpassData(data);
                        });
                }

                const tiles = missingOsmFeatures
                    .map(f => getTileXYZ(f.lat, f.lon, 16))
                    .filter((f, inx, arr) => arr.findIndex(t => t.x === f.x && t.y === f.y) === inx);

                for (const t of tiles) {
                    const overpass = await queryStops(getTileBBox(t));
                    OSM_DATA.updateOverpassData(overpass);
                }

                setLoading?.(false);
            })();
        }
    }, [missingOsmFeatures, setLoading]);

    const overpassElements = useOsmFeatures()
        .filter(e => e.tags && Object.keys(e.tags).length > 0)
        .filter(e => getDistanceLonLat(OSM_DATA.getLonLat(e)!, parentLonLat as [number, number]) < 500)
        .filter(ovp =>
            !osmFeatures.some(f => f.id === `${ovp.type[0]}${ovp.id}`));

    const osmMapElements = overpassElements.map((f: any) => {
        return <HtmlMapMarker key={f.id}
            className={cls(highlightId === `${f.type[0]}${f.id}` && 'highlight')}
            name={f.id} lon={f.lon} lat={f.lat} />
    });

    const markersOsm = osmFeatures.map((f: any, i: number) => {
        return <HtmlMapMarker key={f.id} name={"osm " + letterCode(i)} lon={f.lon} lat={f.lat}
            className={cls(highlightId === f.id && 'highlight')}
        />
    });

    const osmLi = osmFeatures.map((f: any) =>
        <OsmListElement key={f.id} f={f}
            mouseEvents={{ onHoverUpdate: handleHover.bind(undefined, f.id) }}
            {...{ edit, parentLonLat, tagActions }}
        />
    );

    const overpassLi = overpassElements.filter((f: any) => f.id > 0).map((f: any) => {
        const id = f.type[0] + f.id;
        return <OsmListElement key={id} f={{ ...f, id }}
            mouseEvents={{ onHoverUpdate: handleHover.bind(undefined, id) }}
            {...{ edit, parentLonLat, tagActions }}
        />
    });

    const newOverpassLi = overpassElements.filter((f: any) => f.id < 0).map((f: any) => {
        const id = f.type[0] + f.id;
        return <OsmListElement key={id} f={{ ...f, id }} edit={true}
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
    edit: boolean;
    parentLonLat: number[];
    tagActions?: TagActionsT;
    mouseEvents?: MouseEventsHandlers
};

function OsmListElement({ f, edit, parentLonLat, tagActions, mouseEvents }: OsmListElementProps) {
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
    const [tHash, setTHash] = useState<number>(tagsHash(tags) || 0);

    const handleTagsChange = useCallback((tags: { [k: string]: string }) => {

        if (import.meta.env.DEV) {
            console.log('Edit tags for osm feature ', osmFeature, tags);
        }

        if (!osmFeature) {
            return;
        }

        OSM_DATA.setElementTags(tags, osmFeature);

        setTHash(tagsHash(tags));

    }, [osmFeature, tagsHash, setTHash]);

    const handleSetName = useCallback(() => {
        const [key, value] = tagActions?.setName || [];
        import.meta.env.DEV && console.log('SetName', key, value);
        tagActions?.setName && handleTagsChange({ ...tags, [key!]: value });
    }, [handleTagsChange, tags, tagActions]);

    const handleSetId = useCallback(() => {
        const [key, value] = tagActions?.setId || [];
        import.meta.env.DEV && console.log('SetId', key, value);
        tagActions?.setId && handleTagsChange({ ...tags, [key!]: value });
    }, [handleTagsChange, tags, tagActions]);

    const handleSetCode = useCallback(() => {
        const [key, value] = tagActions?.setCode || [];
        import.meta.env.DEV && console.log('SetCode', key, value);
        tagActions?.setCode && handleTagsChange({ ...tags, [key!]: value });
    }, [handleTagsChange, tags, tagActions]);

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
        <div>{osmHref} {distanceInfo} <LocateMe lonlatFeature={f} /></div>
        {alreadyMatchWarning}

        {
            !(edit && osmFeature) ?
                <TagsTable tags={f.tags} /> :
                <TagEditor key={'tags_' + tHash} tags={tags}
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

function MoveController({ onMove }: { onMove: (lonLat: number[]) => void }) {
    const [active, setActive] = useState(false);
    const map = useContext(MapContext)?.map;

    useEffect(() => {
        if (active && map) {
            const sub = map.on('click', (e) => {
                onMove([e.lngLat.lng, e.lngLat.lat]);
                setActive(false);
            });

            return () => {
                sub.unsubscribe();
            }
        }
    }, [map, active, setActive, onMove]);

    return active ?
        <span>
            <span>Click on map to set new location </span>
            <button onClick={() => setActive(false)}>Cancel</button>
        </span> :
        <button onClick={() => setActive(true)}>Move</button>
}

type AddOsmStopControllerProps = {
    edit: boolean;
    name: string;
    id: string;
    code?: string;
    idTags?: { [tag: string]: number };
}
function AddOsmStopController({ name, id, code, idTags }: AddOsmStopControllerProps) {
    const map = useContext(MapContext)?.map;
    const [active, setActive] = useState(false);

    useEffect(() => {
        if (!map) {
            return;
        }

        if (active) {
            const sub = map.on('click', (e) => {
                const m = new Marker().setLngLat([e.lngLat.lng, e.lngLat.lat]).addTo(map);
                m.getElement().innerText = name;

                const gtfsIdTag = Object.entries(idTags || {}).map(([k, _cnt]) => k)[0] || 'ref:gtfs';
                const tags = {
                    name,
                    [gtfsIdTag]: code || id,
                };

                OSM_DATA.createNewNode(e.lngLat, tags);

                setActive(false);
            });

            return () => {
                sub.unsubscribe();
            }
        }

    }, [map, active, setActive, name, id, code, idTags]);

    return (
        <>
            {active ?
                <span>
                    <span>Click on map to add OSM Stop </span>
                    <button onClick={() => setActive(false)}>Cancel</button>
                </span> :
                <button onClick={() => setActive(true)}>Add OSM Stop</button>}
        </>
    )
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
    }
}
function TagsTable({ tags }: TagsTableProps) {

    const rows = Object.entries(tags).map(([k, v]) => <tr key={k}>
        <td>{k}</td>
        <td>{v}</td>
    </tr>);

    return <table>
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

function tagsHash(tags: { [key: string]: string }): number {
    let hash = 0;
    const keys = Object.keys(tags).sort();

    for (const key of keys) {
        const str = key + ':' + tags[key];
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash |= 0;
        }
    }

    return hash;
}