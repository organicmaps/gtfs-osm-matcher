import { useContext, useEffect } from "preact/hooks";
import { MapContext, type SelectionT } from "../app";

import { Marker } from "maplibre-gl";
import "./selection-info.css";
import { getDistance } from "../map/distance";
import { LocateMe } from "./locate-me";

export type SelectionInfoProps = {
    selection: SelectionT | null
}
export function SelectionInfo({selection}: SelectionInfoProps) {
    const properties = selection?.feature.properties;
    const datasetName = selection?.datasetName;
    const reportRegion = selection?.reportRegion;

    const name = properties?.['gtfsStopName'] || properties?.['name'];

    console.log('selection info render, selection:', selection);

    const isCluster = ["clusters", "many-to-one", "transit-hub-clusters"].includes(datasetName || '');

    const geometry = selection?.feature.geometry;

    return (<div id={"selection-info"}>
        <h2>{name}</h2>
        { !isCluster && properties && reportRegion && <MatchInfo {...{datasetName, properties, geometry, reportRegion}}/> }
        { isCluster && properties && reportRegion && <ClusterInfo {...{datasetName, properties, geometry, reportRegion}}/> }
    </div>)
}

const ABC = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";


type MatchInfoProps = {
    properties: {[k: string]: any}
    geometry: GeoJSON.Geometry | undefined
    datasetName?: string
    reportRegion: string
}
function MatchInfo({datasetName, properties, geometry, reportRegion}: MatchInfoProps) {
    //@ts-ignore
    var ignore = reportRegion;

    const osmFeatures = parseJsonSafe(properties['osmFeatures'], []);
    //@ts-ignore
    const [lon, lat] = geometry?.coordinates || [];

    const osmLi = osmFeatures.map((f: any) => {
        const type = f.id[0] === 'n' ? 'node' : 'way';
        const idn = f.id.slice(1);
        const distanceInfo = lon && lat && <span> ({getDistance([lat, lon], [f.lat, f.lon]).toFixed(1)}m) </span>;
        return <li key={f.id}>
            <b>{f.tags.name} </b> 
            <div><a target="_blank" href={`https://osm.org/${type}/${idn}`}>{f.id}</a> {distanceInfo} <LocateMe lonlatFeature={f} /></div>
            <TagsTable tags={f.tags}/>
        </li>
    });

    const markersOsm = osmFeatures.map((f: any, i: number) => 
        <HtmlMapMarker key={f.id} name={"osm " + letterCode(i)} lon={f.lon} lat={f.lat} /> );

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
    
    return (<div>
        <p>{info}</p>

        <div>Gtfs stop Id: <b>{properties.gtfsStopId}</b></div>
        <div>Gtfs route types: <b>{properties.gtfsRouteTypes}</b></div>

        <div>
        <h4>OSM Feautures</h4>
            <ol type="A">
            { osmLi }
            </ol>
        </div>

        {markersOsm}
    </div>)
}


type ClusterInfoProps = {
    properties: {[k: string]: any}
    geometry: GeoJSON.Geometry | undefined
    datasetName?: string
    reportRegion: string
}
function ClusterInfo({properties}: ClusterInfoProps) {

    const gtfsFeatures = JSON.parse(properties['gtfsFeatures']);
    const osmFeatures = JSON.parse(properties['osmFeatures']);

    const gtfsLi = gtfsFeatures.map((f: any) => <li key={f.id}><span>{f.id}</span></li>);
    const osmLi = osmFeatures.map((f: any) => 
        <li key={f.id}>
            <b>{f.tags.name} </b> ({f.id}) <LocateMe lonlatFeature={f} />
            <TagsTable tags={f.tags}/>
        </li>
    );

    const markersOsm = osmFeatures.map((f: any, i: number) => <HtmlMapMarker key={f.id} name={"osm " + letterCode(i)} lon={f.lon} lat={f.lat} />);
    const markersGtfs = gtfsFeatures.map((f: any, i: number) => <HtmlMapMarker key={f.id} name={"gtfs " + letterCode(i)} lon={f.lon} lat={f.lat} />);

    return (<div>
        <i>Multiple gtfs stops matched by name to the same group of OSM features.</i>
        <div>
            <h4>Gtfs Feautures</h4>
            <ol type="A">
            { gtfsLi }
            </ol>
            <label>Gtfs route types: </label>{ parseJsonSafe(properties?.gtfs_types, []).join(", ") }
        </div>

        
        <div>
        <h4>OSM Feautures</h4>
            <ol type="A">
            { osmLi }
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
function HtmlMapMarker({name, lat, lon}: HtmlMapMarkerProps) {

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





type TagsTableProps = {
    tags: {
        [k: string]: string
    }
}
function TagsTable({tags}: TagsTableProps) {

    const rows = Object.entries(tags).map(([k, v]) => <tr key={k}>
        <td>{k}</td>
        <td>{v}</td>
    </tr>);

    return <table>
        <tbody>
            { rows }
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