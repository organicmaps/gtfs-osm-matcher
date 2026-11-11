import { useCallback, useState } from "preact/hooks";

import OSMData, { encodeChanges, type OSMDataChange } from "../../services/OSMData";
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
                data = encodeChanges(changes, region, osmData);
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
                data = encodeChanges(changes, region, osmData);
            } catch (error) {
                setJosmStatus(error instanceof Error ? error.message : 'Could not export OSM data.');
                return;
            }
            const status = await loadInJosm(data);

            if (status >= 400) {
                setJosmStatus(`JOSM returned HTTP ${status}. You can download the OSM file instead.`);
                return;
            }

            ignoreChanges(changes);

            setJosmStatus('Request accepted. Check JOSM for the GTFS stop edits layer. Loaded changes are now ignored.');
        } catch {
            setJosmStatus('Could not reach JOSM. Open JOSM, enable Remote Control, or download the OSM file.');
        } finally {
            setLoadingJosm(false);
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
        {josmStatus && <p role="status">{josmStatus}</p>}
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
