// Run: node_modules/.bin/esbuild tests/osm-export.test.ts --bundle --platform=node --format=esm --outfile=/tmp/osm-export.test.mjs && node --test /tmp/osm-export.test.mjs
import assert from 'node:assert/strict';
import { test } from 'node:test';
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
