import { snapshotChanges, unchangedChanges } from '../src/services/osmChangeSnapshot';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { OSM_QUERY_QUEUE } from '../src/services/OsmQuerryQueue';
import { OSM_DATA } from '../src/services/OSMData';
import OSMData, { encodeChanges, resolveDependencies, type OSMDataChange } from '../src/services/OSMData';

function exportChanges(changes: OSMDataChange[], region?: string, data?: OSMData) {
    const { dependencies, unresolved } = resolveDependencies(changes, data);
    if (unresolved.length) {
        const { type, ref, referencedBy } = unresolved[0];
        throw new Error(`${referencedBy.type} ${referencedBy.id}: ${type} ${ref} is missing`);
    }
    return encodeChanges(changes, region, dependencies);
}

function fixture() {
    const data = new OSMData();
    data.addElement({ type: 'node', id: 1, version: 2, lat: 10, lon: 20, tags: { name: 'Original' } });
    data.addElement({ type: 'node', id: 2, version: 3, lat: 11, lon: 21, tags: {} });
    data.addElement({ type: 'way', id: 3, version: 4, nodes: [1, 2, 1], tags: {} });
    data.setElementTags({ name: 'Edited way' }, data.getWayById(3));
    return data;
}

test('way export includes complete, unique, unmodified child nodes before the way', () => {
    const data = fixture();
    const xml = exportChanges(data.listChanges(), undefined, data);
    assert.equal((xml.match(/<node /g) || []).length, 2);
    assert.match(xml, /<node id="1" version="2" lat="10" lon="20">/);
    assert.match(xml, /<node id="2" version="3" lat="11" lon="21">/);
    assert.match(xml, /<way id="3" version="4" action="modify"><nd ref="1"><\/nd><nd ref="2"><\/nd><nd ref="1"><\/nd>/);
    assert.ok(xml.indexOf('<node ') < xml.indexOf('<way '));
    assert.equal((xml.match(/action="modify"/g) || []).length, 1);
});

test('shared nodes are included once across multiple ways', () => {
    const data = fixture();
    data.addElement({ type: 'way', id: 4, version: 1, nodes: [2, 1], tags: {} });
    data.setElementTags({ name: 'Second way' }, data.getWayById(4));
    const xml = exportChanges(data.listChanges(), undefined, data);
    assert.equal((xml.match(/<node /g) || []).length, 2);
    assert.equal((xml.match(/<way /g) || []).length, 2);
});

test('included node edits win while ignored node edits use the original', () => {
    const data = fixture();
    data.setElementTags({ name: 'Edited node' }, data.getNodeById(1));
    const xml = exportChanges(data.listChanges(), undefined, data);
    assert.equal((xml.match(/<node id="1"/g) || []).length, 1);
    assert.match(xml, /<node id="1" version="2" action="modify"/);
    assert.match(xml, /v="Edited node"/);
    const ignored = exportChanges(data.listChanges().filter(c => c.element.type === 'way'), undefined, data);
    assert.match(ignored, /v="Original"/);
    assert.doesNotMatch(ignored, /Edited node/);
});

test('missing child nodes fail export', () => {
    const data = fixture();
    data.idMap.delete('node2');
    assert.throws(() => exportChanges(data.listChanges(), undefined, data), /way 3: node 2 is missing/);
});

test('existing and newly created node edits retain coordinates and escaped tags', () => {
    const data = new OSMData();
    data.addElement({ type: 'node', id: 1, version: 2, lat: 10, lon: 20, tags: {} });
    data.setElementTags({ name: 'A&B' }, data.getNodeById(1));
    data.setNodeLatLng({ lat: 12, lng: 22 }, data.getNodeById(1));
    data.createNewNode({ lat: 30, lng: 40 }, { name: 'New' });
    const xml = exportChanges(data.listChanges(), undefined, data);
    assert.match(xml, /id="1" version="2" action="modify" lat="12" lon="22"/);
    assert.match(xml, /v="A&amp;B"/);
    assert.match(xml, /id="-1" version="0" action="modify" lat="30" lon="40"/);
});

function relationFixture() {
    const data = fixture();
    data.addElement({ type: 'relation', id: 5, version: 1, tags: {}, members: [
        { type: 'way', ref: 3, role: 'outer' },
        { type: 'node', ref: 1, role: 'stop&entry' },
        { type: 'relation', ref: 6 },
    ] });
    data.addElement({ type: 'relation', id: 6, version: 2, tags: {}, members: [
        { type: 'relation', ref: 5, role: 'parent' },
        { type: 'node', ref: 2 },
    ] });
    data.setElementTags({ name: 'Edited relation' }, data.getRelationById(5));
    return data;
}

test('relations retain member order, types and roles with complete recursive dependencies and cycles', () => {
    const data = relationFixture();
    const xml = exportChanges(data.listChanges().filter(c => c.element.type === 'relation'), undefined, data);
    assert.equal((xml.match(/<node /g) || []).length, 2);
    assert.equal((xml.match(/<way /g) || []).length, 1);
    assert.equal((xml.match(/<relation /g) || []).length, 2);
    assert.equal((xml.match(/action="modify"/g) || []).length, 1);
    assert.match(xml, /<member type="way" ref="3" role="outer"><\/member><member type="node" ref="1" role="stop&amp;entry"><\/member><member type="relation" ref="6" role=""><\/member>/);
    assert.match(xml, /<member type="relation" ref="5" role="parent">/);
    assert.ok(xml.indexOf('<node ') < xml.indexOf('<way '));
    assert.ok(xml.indexOf('<way ') < xml.indexOf('<relation '));
    assert.doesNotMatch(xml, /Edited way/);
});

test('included member edits are exported exactly once', () => {
    const data = relationFixture();
    data.setElementTags({ name: 'Edited child relation' }, data.getRelationById(6));
    const xml = exportChanges(data.listChanges(), undefined, data);
    assert.match(xml, /v="Edited way"/);
    assert.match(xml, /v="Edited child relation"/);
    assert.equal((xml.match(/<relation id="6"/g) || []).length, 1);
    assert.equal((xml.match(/action="modify"/g) || []).length, 3);
});

test('missing relation members fail export for each element type', () => {
    for (const [key, description] of [['node1', 'node 1'], ['way3', 'way 3'], ['relation6', 'relation 6']]) {
        const data = relationFixture();
        data.idMap.delete(key);
        data.changes = data.changes.filter(c => c.element.type === 'relation');
        assert.throws(() => exportChanges(data.listChanges(), undefined, data),
            new RegExp(`relation 5: ${description} is missing`));
    }
});

test('ignored child relation edits use original membership and tags', () => {
    const data = relationFixture();
    data.setElementTags({ name: 'Ignored relation' }, data.getRelationById(6));
    data.getRelationById(6).members = [{ type: 'node', ref: 999 }];
    const xml = exportChanges(data.listChanges().filter(c => c.element.id === 5), undefined, data);
    assert.doesNotMatch(xml, /Ignored relation|ref="999"/);
    assert.match(xml, /<member type="relation" ref="5" role="parent">/);
});

test('tag subscribers see applied edits, original snapshots and reverted changes', () => {
    const data = new OSMData();
    data.addElement({ type: 'node', id: 1, lat: 1, lon: 2, tags: { name: 'Original' } });
    const observed: number[] = [];
    data.subscribe(() => observed.push(data.listChanges().length));
    data.setElementTags({ name: 'Edited' }, data.getNodeById(1));
    assert.equal(data.changes[0].original.tags.name, 'Original');
    data.setElementTags({ name: 'Original' }, data.getNodeById(1));
    assert.deepEqual(observed, [1, 0]);
});

test('export metadata is contained in an id-less changeset', () => {
    const xml = exportChanges([], 'A&B');
    assert.match(xml, /<changeset><tag k="created_by"[^]*<tag k="hashtags"[^]*<tag k="data_used" v="A&amp;B"><\/tag><\/changeset>/);
});

test('editor loads relation candidates with recursive ways, nodes and cyclic relations', async () => {
    const source = relationFixture();
    const originalFetch = globalThis.fetch;
    OSM_DATA.idMap.clear();
    OSM_DATA.elements = [];
    OSM_DATA.changes = [];
    const requests: string[] = [];
    const unsubscribe = OSM_DATA.subscribe(() => {
        assert.ok(OSM_DATA.getNodeById(2), 'publish only after dependencies load');
    });
    globalThis.fetch = async input => {
        const url = new URL(String(input));
        requests.push(url.pathname);
        const type = url.pathname.split('/').pop()!.replace('s.json', '');
        const ids = url.searchParams.get(type + 's')!.split(',').map(Number);
        return new Response(JSON.stringify({ elements: ids.map(id => source.getByTypeAndId(type, id)) }));
    };
    try {
        await OSM_QUERY_QUEUE.queryDataByIds([], [], ['5']);
        assert.equal(requests.length, 5);
        OSM_DATA.setElementTags({ name: 'Exported relation' }, OSM_DATA.getRelationById(5));
        assert.match(exportChanges(OSM_DATA.listChanges(), undefined, OSM_DATA), /Exported relation/);
        assert.equal(OSM_DATA.elements.length, 5);
    } finally {
        globalThis.fetch = originalFetch;
        unsubscribe();
        OSM_DATA.idMap.clear();
        OSM_DATA.elements = [];
        OSM_DATA.changes = [];
    }
});

test('pending JOSM success ignores only sent elements whose data still matches', async () => {
    const data = relationFixture();
    data.setElementTags({ name: 'Sent node' }, data.getNodeById(1));
    const snapshot = snapshotChanges(data.listChanges());
    let accept!: () => void;
    const request = new Promise<void>(resolve => { accept = resolve; });
    const completion = request.then(() => unchangedChanges(data.listChanges(), snapshot));

    data.setElementTags({ name: 'Newer node edit' }, data.getNodeById(1));
    data.getWayById(3).nodes.push(2);
    data.getRelationById(5).members[0].role = 'inner';
    data.createNewNode({ lat: 30, lng: 40 }, { name: 'Created while waiting' });
    accept();
    assert.deepEqual(await completion, []);
});

test('unchanged sent edits match despite tag insertion order and unrelated edits', () => {
    const data = fixture();
    data.setElementTags({ name: 'Sent', ref: '1' }, data.getNodeById(1));
    const snapshot = snapshotChanges(data.listChanges());
    data.setElementTags({ ref: '1', name: 'Sent' }, data.getNodeById(1));
    data.createNewNode({ lat: 30, lng: 40 }, {});
    assert.deepEqual(unchangedChanges(data.listChanges(), snapshot).map(c => c.element.id), [3, 1]);
    data.setNodeLatLng({ lat: 12, lng: 22 }, data.getNodeById(1));
    assert.deepEqual(unchangedChanges(data.listChanges(), snapshot).map(c => c.element.id), [3]);
});

test('an edit reverted to the sent values matches the snapshot', () => {
    const data = fixture();
    const snapshot = snapshotChanges(data.listChanges());
    data.setElementTags({ name: 'Temporary' }, data.getWayById(3));
    data.setElementTags({ name: 'Edited way' }, data.getWayById(3));
    assert.equal(unchangedChanges(data.listChanges(), snapshot).length, 1);
});

test('resolution collects all missing references once and can be retried after loading', () => {
    const data = relationFixture();
    data.idMap.delete('node1');
    data.idMap.delete('node2');
    const changes = data.listChanges().filter(c => c.element.type === 'relation');
    const result = resolveDependencies(changes, data);
    assert.deepEqual(result.unresolved.map(({ type, ref }) => [type, ref]), [['node', 1], ['node', 2]]);
    assert.equal(result.dependencies.length, 2);
    for (const id of [1, 2]) data.addElement({ type: 'node', id, lat: id, lon: id, tags: {} });
    const resolved = resolveDependencies(changes, data);
    assert.deepEqual(resolved.unresolved, []);
    assert.equal(resolved.dependencies.length, 4);
    assert.match(encodeChanges(changes, undefined, resolved.dependencies), /<node id="2"/);
});

test('incomplete dependency coordinates are reported without stopping traversal', () => {
    const data = fixture();
    data.getNodeById(1).lat = NaN;
    data.getNodeById(2).lon = Infinity;
    assert.deepEqual(resolveDependencies(data.listChanges(), data).unresolved.map(d => d.ref), [1, 2]);
});

test('encoding only serializes supplied elements and gives edits precedence', () => {
    const data = fixture();
    assert.doesNotMatch(encodeChanges(data.listChanges()), /<node /);
    const xml = encodeChanges(data.listChanges(), undefined, [data.changes[0].original]);
    assert.equal((xml.match(/<way /g) || []).length, 1);
    assert.match(xml, /Edited way/);
});

test('missing data download fills a supplied store recursively and repairs incomplete nodes', async () => {
    const source = relationFixture();
    const data = new OSMData();
    data.addElement({ type: 'node', id: 1, lat: NaN, lon: 20, tags: {} });
    const originalFetch = globalThis.fetch;
    const requests: string[] = [];
    globalThis.fetch = async input => {
        const url = new URL(String(input));
        requests.push(url.pathname);
        const type = url.pathname.split('/').pop()!.replace('s.json', '');
        const ids = url.searchParams.get(type + 's')!.split(',').map(Number);
        return new Response(JSON.stringify({ elements: ids.map(id => source.getByTypeAndId(type, id)) }));
    };
    try {
        await OSM_QUERY_QUEUE.queryDataByIds([], [], [5], data);
        data.setElementTags({ name: 'Export' }, data.getRelationById(5));
        assert.deepEqual(resolveDependencies(data.listChanges(), data).unresolved, []);
        assert.equal(data.getNodeById(1).lat, 10);
        assert.equal(data.elements.length, 5);
        assert.equal(requests.length, 5);
    } finally {
        globalThis.fetch = originalFetch;
    }
});

test('missing data download reports HTTP failures without changing the store', async () => {
    const data = new OSMData();
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => new Response('', { status: 404 });
    try {
        await assert.rejects(OSM_QUERY_QUEUE.queryDataByIds([999], [], [], data), /HTTP 404/);
        assert.equal(data.elements.length, 0);
    } finally {
        globalThis.fetch = originalFetch;
    }
});
