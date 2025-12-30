import { useContext, useEffect, useState } from "preact/hooks";
import { MapContext, MatchReportContext, type SelectionT } from "../app";

import { Marker } from "maplibre-gl";
import { getDistance } from "../map/distance";
import { LocateMe } from "./locate-me";
import { TagEditor } from "./osm-tags";

const FEATURE_ENABLE_EDIT = import.meta.env.MODE === 'development';

import "./selection-info.css";
import { Routes } from "./routes";

export type SelectionInfoProps = {
    selection: SelectionT | null
}
export function SelectionInfo({ selection }: SelectionInfoProps) {

    const [edit, setEdit] = useState(false);

    const properties = selection?.feature.properties;
    const datasetName = selection?.datasetName;
    const reportRegion = selection?.reportRegion;

    const name = properties?.['gtfsStopName'] || properties?.['name'];

    console.log('selection info render, selection:', selection);

    const geometry = selection?.feature.geometry;
    const isCluster = ["clusters", "many-to-one", "transit-hub-clusters"].includes(datasetName || '');


    return (<div id={"selection-info"}>
        <h2>{name}</h2>
        {!isCluster && properties && reportRegion &&
            <MatchInfo edit={edit} setEdit={setEdit}
                {...{ datasetName, properties, geometry, reportRegion }} />}
        {isCluster && properties && reportRegion &&
            <ClusterInfo edit={edit} setEdit={setEdit}
                {...{ datasetName, properties, geometry, reportRegion }} />}
    </div>)
}

const ABC = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";


type MatchInfoProps = {
    properties: { [k: string]: any }
    geometry: GeoJSON.Geometry | undefined
    reportRegion: string
    datasetName?: string
    edit: boolean
    setEdit: (edit: boolean) => void
}
function MatchInfo({ edit, setEdit, datasetName, properties, geometry }: MatchInfoProps) {

    const idTagsStatistics = useContext(MatchReportContext)?.idTags;

    //@ts-ignore
    const [lon, lat] = geometry?.coordinates || [];
    const osmFeatures = parseJsonSafe(properties['osmFeatures'], []);
    const routes = parseJsonSafe(properties['gtfsRoutes'], null);

    if (lon && lat) {
        osmFeatures.sort((a: any, b: any) =>
            getDistance([lon, lat], [a.lon, a.lat]) - getDistance([lon, lat], [b.lon, b.lat]));
    }

    const osmLi = osmFeatures.map((f: any) =>
        <OsmListElement f={f} parentLonLat={[lon, lat]} edit={edit} />
    );

    const markersOsm = osmFeatures.map((f: any, i: number) =>
        <HtmlMapMarker key={f.id} name={"osm " + letterCode(i)} lon={f.lon} lat={f.lat} />);

    return (<div>
        <DatasetHelp datasetName={datasetName} />

        <div>Gtfs stop Id: <b>{properties.gtfsStopId}</b></div>
        {properties.gtfsStopCode && <div>Gtfs stop Code: <b>{properties.gtfsStopCode}</b></div>}

        {
            <div>Id or Code osm tags: {idTagsStatistics && Object.entries(idTagsStatistics)
                .map(([tag, count]) => <span key={tag}><b>{tag}</b> ({count}) </span>)}</div>
        }

        <Routes routes={routes} gtfsRouteTypes={properties.gtfsRouteTypes} stopLonLat={[lon, lat]} />

        {FEATURE_ENABLE_EDIT && <div>
            <label>Edit:</label> <input type="checkbox" checked={edit}
                onChange={(e: Event) => setEdit((e.target as HTMLInputElement).checked)} />
        </div>}

        <div>
            <h4>OSM Feautures</h4>
            <ol type="A">
                {osmLi}
            </ol>
        </div>

        {markersOsm}
    </div>)
}


type ClusterInfoProps = {
    properties: { [k: string]: any }
    geometry: GeoJSON.Geometry | undefined
    datasetName?: string
    reportRegion: string
    edit: boolean
    setEdit: (edit: boolean) => void
}
function ClusterInfo({ edit, setEdit, properties, geometry, datasetName }: ClusterInfoProps) {

    //@ts-ignore
    const [lon, lat] = geometry?.coordinates || [];

    const gtfsFeatures = JSON.parse(properties['gtfsFeatures']);
    const osmFeatures = JSON.parse(properties['osmFeatures']);

    if (lon && lat) {
        osmFeatures.sort((a: any, b: any) =>
            getDistance([lon, lat], [a.lon, a.lat]) - getDistance([lon, lat], [b.lon, b.lat]));
    }

    const gtfsLi = gtfsFeatures.map((f: any) => <li key={f.id}><span>{f.id}</span>{f.code && <span> code: {f.code}</span>}</li>);
    const osmLi = osmFeatures.map((f: any) => <OsmListElement f={f} parentLonLat={[lon, lat]} edit={edit} />);

    const markersOsm = osmFeatures.map((f: any, i: number) =>
        <HtmlMapMarker key={f.id} name={"osm " + letterCode(i)} lon={f.lon} lat={f.lat} />);

    const markersGtfs = gtfsFeatures.map((f: any, i: number) =>
        <HtmlMapMarker key={f.id} name={"gtfs " + letterCode(i)} lon={f.lon} lat={f.lat} />);

    return (<div>
        <DatasetHelp datasetName={datasetName} />
        <div>
            <div><label>Edit:</label> <input type="checkbox" checked={edit}
                onChange={(e: Event) => setEdit((e.target as HTMLInputElement).checked)} />
            </div>

            <h4>Gtfs Feautures</h4>
            <ol type="A">
                {gtfsLi}
            </ol>
            <label>Gtfs route types: </label>{parseJsonSafe(properties?.gtfs_types, []).join(", ")}
        </div>


        <div>
            <h4>OSM Feautures</h4>
            <ol type="A">
                {osmLi}
            </ol>
        </div>

        {markersOsm}
        {markersGtfs}

    </div>)
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