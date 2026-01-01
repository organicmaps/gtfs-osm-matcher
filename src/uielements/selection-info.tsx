import { useCallback, useContext, useEffect, useState } from "preact/hooks";
import { MapContext, MatchReportContext, type SelectionT } from "../app";

import { Marker } from "maplibre-gl";
import { getDistance } from "../map/distance";
import { LocateMe } from "./locate-me";
import { TagEditor } from "./osm-tags";

const FEATURE_ENABLE_EDIT = import.meta.env.MODE === 'development';

const OSM_DATA = new OSMData();

import "./selection-info.css";
import { Routes } from "./routes";
import OSMData from "../services/OSMData";

const ABC = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

export type SelectionInfoProps = {
    selection: SelectionT | null
}
export function SelectionInfo({ selection }: SelectionInfoProps) {

    const properties = selection?.feature.properties;
    const datasetName = selection?.datasetName;
    const reportRegion = selection?.reportRegion;

    const geometry = selection?.feature.geometry;

    return (<div id={"selection-info"}>
        {properties && reportRegion &&
            <MatchInfo {...{ datasetName, properties, geometry, reportRegion }} />}
    </div>)
}


type MatchInfoProps = {
    properties: { [k: string]: any }
    geometry: GeoJSON.Geometry | undefined
    reportRegion: string
    datasetName?: string
}
function MatchInfo({ datasetName, properties, geometry }: MatchInfoProps) {
    const [edit, setEdit] = useState(false);

    const name = properties?.['gtfsStopName'] || properties?.['name'];

    const idTagsStatistics = useContext(MatchReportContext)?.idTags;

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

        <div>
            <label>Gtfs route types: </label>{parseJsonSafe(properties?.gtfs_types, []).join(", ")}
        </div>

        <Routes routes={routes} gtfsRouteTypes={properties.gtfsRouteTypes} stopLonLat={[lon, lat]} />

        {FEATURE_ENABLE_EDIT &&
            <div className={"edit-actions"}>
                <label>Edit:</label> <input type="checkbox" checked={edit}
                    onChange={(e: Event) => setEdit((e.target as HTMLInputElement).checked)} />
            </div>}

        <OsmElements edit={edit} osmFeatures={osmFeatures} parentLonLat={[lon, lat]} />

    </div>)
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


type HtmlMapMarkerProps = {
    name: string
    lat: number
    lon: number
}
function HtmlMapMarker({ name, lat, lon }: HtmlMapMarkerProps) {

    const map = useContext(MapContext)?.map;

    useEffect(() => {
        if (!map) return;

        const m = new Marker().setLngLat([lon, lat]).addTo(map);
        m.getElement().innerText = name;

        return () => {
            m.remove();
        }

    }, [map, name, lat, lon]);

    return <></>
}

interface OsmElementsProps {
    edit: boolean;
    osmFeatures: any[];
    parentLonLat: number[];
}
function OsmElements({ edit, osmFeatures, parentLonLat }: OsmElementsProps) {

    useEffect(() => {
        if (edit && osmFeatures) {
            const nodes = osmFeatures.filter(f => f.id[0] === 'n').map(f => f.id.substring(1));
            const ways = osmFeatures.filter(f => f.id[0] === 'w').map(f => f.id.substring(1));

            fetch('https://api.openstreetmap.org/api/0.6/nodes.json?nodes=' + nodes.join(','))
                .then(response => response.json())
                .then(data => {
                    console.log('osm nodes data', data);
                    OSM_DATA.updateOverpassData(data);
                });

            fetch('https://api.openstreetmap.org/api/0.6/ways.json?ways=' + ways.join(','))
                .then(response => response.json())
                .then(data => {
                    console.log('osm ways data', data);
                    OSM_DATA.updateOverpassData(data);
                });
        }
    }, [edit, osmFeatures]);

    const markersOsm = osmFeatures.map((f: any, i: number) =>
        <HtmlMapMarker key={f.id} name={"osm " + letterCode(i)} lon={f.lon} lat={f.lat} />);

    const osmLi = osmFeatures.map((f: any) =>
        <OsmListElement f={f} {...{ edit, parentLonLat }} />
    );

    return (
        <div>
            <h4>OSM Feautures</h4>
            <ol type="A">
                {osmLi}
            </ol>
            {markersOsm}
        </div>
    )
}

type OsmListElementProps = {
    f: any;
    edit: boolean
    parentLonLat: number[];
};

function OsmListElement({ f, edit, parentLonLat }: OsmListElementProps) {
    const type = f.id[0] === 'n' ? 'node' : 'way';
    const idn = f.id.slice(1);

    const [lon, lat] = parentLonLat;

    const name = f.tags.name;

    const osmUrl = `https://osm.org/${type}/${idn}`;
    const osmHref = <a target="_blank" href={osmUrl}>{f.id}</a>;

    const matchSet = f.matchSet;

    const alreadyMatchWarning = matchSet && matchSet !== 'no-match' &&
        <div className={'warning'}>
            <span>&#9888;</span>This OSM Element is already matched as {matchSet}
        </div>;

    const distanceInfo = lon && lat &&
        <span>
            ({getDistance([lat, lon], [f.lat, f.lon]).toFixed(1)}m)
        </span>;

    return <li key={f.id}>
        <b>{name} </b>
        <div>{osmHref} {distanceInfo} <LocateMe lonlatFeature={f} /></div>
        {alreadyMatchWarning}

        {
            edit ? <TagEditor tags={f.tags} /> : <TagsTable tags={f.tags} />
        }
    </li>
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