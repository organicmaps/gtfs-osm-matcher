import { useCallback, useState } from "preact/hooks";

import OSMData, { encodeChanges, resolveDependencies, type OSMDataChange } from "../../services/OSMData";
import { snapshotChanges, unchangedChanges } from "../../services/osmChangeSnapshot";
import { OSM_QUERY_QUEUE } from "../../services/OsmQuerryQueue";
import { loadInJosm } from "../../services/JosmRemote";
import { LocateMe } from "../locate-me";
import "./changes.css";
import { cls } from "../cls";

type ChangesProps = {
    osmData?: OSMData,
    region?: string
};
export function Changes({ osmData, region }: ChangesProps) {
    const [ignoredChanges, setIgnoredChanges] = useState<string[]>([]);
    const [loadingJosm, setLoadingJosm] = useState(false);
    const [josmStatus, setJosmStatus] = useState('');
    const [loadingMissing, setLoadingMissing] = useState(false);

    const ignoreChanges = useCallback((changes: OSMDataChange[]) => {
        const ids = changes.map(ch => `${ch.element.type[0]}${ch.element.id}`);
        setIgnoredChanges(current => [
            ...current,
            ...ids.filter(id => !current.includes(id)),
        ]);
    }, []);

    const includedChanges = useCallback(() => osmData?.listChanges()
        .filter(ch => !ignoredChanges.includes(`${ch.element.type[0]}${ch.element.id}`)), [osmData, ignoredChanges]);

    const downloadHandler = useCallback(() => {
        const changes = includedChanges();
        if (changes) {
            let data: string;
            try {
                const { dependencies, unresolved } = resolveDependencies(changes, osmData);
                if (unresolved.length) {
                    setJosmStatus('Cannot export until the missing OSM data is downloaded.');
                    return;
                }
                data = encodeChanges(changes, region, dependencies);
                setJosmStatus('');
            } catch (error) {
                setJosmStatus(error instanceof Error ? error.message : 'Could not export OSM data.');
                return;
            }
            const blob = new Blob([data], { type: 'application/xml' });
            const url = URL.createObjectURL(blob);

            download(url, 'gtfs-changes.osm');

            URL.revokeObjectURL(url);

            ignoreChanges(changes);
        }
    }, [includedChanges, ignoreChanges, region, osmData]);

    async function sendToJosm() {
        const changes = includedChanges();
        if (!changes?.length) {
            setJosmStatus('No included changes to load.');
            return;
        }

        setLoadingJosm(true);
        setJosmStatus('');
        try {
            let data: string;
            try {
                const { dependencies, unresolved } = resolveDependencies(changes, osmData);
                if (unresolved.length) {
                    setJosmStatus('Cannot export until the missing OSM data is downloaded.');
                    return;
                }
                data = encodeChanges(changes, region, dependencies);
            } catch (error) {
                setJosmStatus(error instanceof Error ? error.message : 'Could not export OSM data.');
                return;
            }
            const sentSnapshot = snapshotChanges(changes);
            const status = await loadInJosm(data);

            if (status >= 400) {
                setJosmStatus(`JOSM returned HTTP ${status}. You can download the OSM file instead.`);
                return;
            }

            const unchanged = unchangedChanges(osmData?.listChanges() ?? [], sentSnapshot);
            ignoreChanges(unchanged);

            setJosmStatus('Request accepted. Check JOSM for the GTFS stop edits layer. Unchanged loaded edits are now ignored; newer edits remain included.');
        } catch {
            setJosmStatus('Could not reach JOSM. Open JOSM, enable Remote Control, or download the OSM file.');
        } finally {
            setLoadingJosm(false);
        }
    }

    const unresolved = resolveDependencies(includedChanges() ?? [], osmData).unresolved;

    async function downloadMissing() {
        if (!osmData) return;
        setLoadingMissing(true);
        setJosmStatus('');
        try {
            const missing = resolveDependencies(includedChanges() ?? [], osmData).unresolved;
            await OSM_QUERY_QUEUE.queryDataByIds(
                missing.filter(d => d.type === 'node').map(d => d.ref),
                missing.filter(d => d.type === 'way').map(d => d.ref),
                missing.filter(d => d.type === 'relation').map(d => d.ref),
                osmData,
            );
            const remaining = resolveDependencies(includedChanges() ?? [], osmData).unresolved;
            setJosmStatus(remaining.length
                ? 'Some OSM data is still missing. You can retry the download.'
                : 'Missing OSM data downloaded. You can now export or load the changes in JOSM.');
        } catch (error) {
            console.error('Could not download missing OSM data', error);
            setJosmStatus(error instanceof Error ? error.message : 'Could not download missing OSM data.');
        } finally {
            setLoadingMissing(false);
        }
    }

    const changes = osmData?.listChanges().map(ch => {
        const nwrId = `${ch.element.type[0]}${ch.element.id}`;
        const ignored = ignoredChanges.includes(nwrId);
        const lonLat = osmData?.getLonLat(ch.element);

        return <div className={cls('osm-change', ignored && 'ignored')}>
            <span className={'actions'} title={"Ignored changes will not be exported to OSM changeset"}>
                <button onClick={() => {
                    if (ignored) {
                        setIgnoredChanges(ignoredChanges.filter(id => id !== nwrId));
                    } else {
                        setIgnoredChanges([...ignoredChanges, nwrId]);
                    }
                }}>
                    {ignored ? 'Restore' : 'Ignore'}
                </button>
            </span>

            <span className={'change-element-type'}>{ch.element.type}</span>
            <span className={'change-element-id'}>{ch.element.id + (ch.element.id < 0 ? ' (new)' : '')}</span>
            <span className={'change-element-name'}>
                {ch.element.tags?.name ? <b>{ch.element.tags.name}</b> : '<No Name>'}
            </span>
            {lonLat && <LocateMe lonlatFeature={{ lon: lonLat[0], lat: lonLat[1] }} zoom={18} />}
            <span className={'change-actions'}>Actions: <span className={'change-action'}>{asArray(ch.action).join(', ')}</span></span>
        </div>
    });

    return <>
        <h4>Changes</h4>
        <div className={'osm-changes-list'}>
            {changes}
        </div>
        <div className={'osm-changes-actions'}>
            <button onClick={downloadHandler}>Download as OSM file</button>

            <button onClick={sendToJosm} disabled={loadingJosm}>
                {loadingJosm ? 'Sending to JOSM…' : 'Load in JOSM'}
            </button>
        </div>
        <div role="status">
            {josmStatus && <p>{josmStatus}</p>}
            {unresolved.length > 0 && <p>Some referenced OSM data is missing. Download it before downloading the changes or loading them in JOSM.</p>}
        </div>
        {unresolved.length > 0 && <button onClick={downloadMissing} disabled={loadingMissing}>
            {loadingMissing ? 'Downloading missing OSM data…' : 'Download missing OSM data'}
        </button>}
    </>
}

function asArray(arg: any) {
    return Array.isArray(arg) ? arg : [arg];
}

function download(path: string, filename: string) {
    const anchor = document.createElement('a');
    anchor.href = path;
    anchor.download = filename;

    document.body.appendChild(anchor);

    anchor.click();

    document.body.removeChild(anchor);
}
