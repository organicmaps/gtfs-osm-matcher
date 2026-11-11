import assert from 'node:assert/strict';
import { test } from 'node:test';
import { OSM_QUERY_QUEUE } from '../src/services/OsmQuerryQueue';
import { OSM_DATA } from '../src/services/OSMData';
import OSMData, { encodeChanges } from '../src/services/OSMData';

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
    const xml = encodeChanges(data.listChanges(), undefined, data);
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
    const xml = encodeChanges(data.listChanges(), undefined, data);
    assert.equal((xml.match(/<node /g) || []).length, 2);
    assert.equal((xml.match(/<way /g) || []).length, 2);
});

test('included node edits win while ignored node edits use the original', () => {
    const data = fixture();
    data.setElementTags({ name: 'Edited node' }, data.getNodeById(1));
    const xml = encodeChanges(data.listChanges(), undefined, data);
    assert.equal((xml.match(/<node id="1"/g) || []).length, 1);
    assert.match(xml, /<node id="1" version="2" action="modify"/);
    assert.match(xml, /v="Edited node"/);
    const ignored = encodeChanges(data.listChanges().filter(c => c.element.type === 'way'), undefined, data);
    assert.match(ignored, /v="Original"/);
    assert.doesNotMatch(ignored, /Edited node/);
});

test('missing child nodes fail export', () => {
    const data = fixture();
    data.idMap.delete('node2');
    assert.throws(() => encodeChanges(data.listChanges(), undefined, data), /way 3: node 2 is missing/);
});

test('existing and newly created node edits retain coordinates and escaped tags', () => {
    const data = new OSMData();
    data.addElement({ type: 'node', id: 1, version: 2, lat: 10, lon: 20, tags: {} });
    data.setElementTags({ name: 'A&B' }, data.getNodeById(1));
    data.setNodeLatLng({ lat: 12, lng: 22 }, data.getNodeById(1));
    data.createNewNode({ lat: 30, lng: 40 }, { name: 'New' });
    const xml = encodeChanges(data.listChanges(), undefined, data);
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
    const xml = encodeChanges(data.listChanges().filter(c => c.element.type === 'relation'), undefined, data);
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
    const xml = encodeChanges(data.listChanges(), undefined, data);
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
        assert.throws(() => encodeChanges(data.listChanges(), undefined, data),
            new RegExp(`relation 5: ${description} is missing`));
    }
});

test('ignored child relation edits use original membership and tags', () => {
    const data = relationFixture();
    data.setElementTags({ name: 'Ignored relation' }, data.getRelationById(6));
    data.getRelationById(6).members = [{ type: 'node', ref: 999 }];
    const xml = encodeChanges(data.listChanges().filter(c => c.element.id === 5), undefined, data);
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
    const xml = encodeChanges([], 'A&B');
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
        assert.match(encodeChanges(OSM_DATA.listChanges(), undefined, OSM_DATA), /Exported relation/);
        assert.equal(OSM_DATA.elements.length, 5);
    } finally {
        globalThis.fetch = originalFetch;
        unsubscribe();
        OSM_DATA.idMap.clear();
        OSM_DATA.elements = [];
        OSM_DATA.changes = [];
    }
});
