import assert from 'node:assert/strict';
import { test } from 'node:test';
import { analyze, distance, geometryDistance } from '../web/track.mjs';

test('haversine agrees with one degree along the Equator', () => {
  assert.ok(Math.abs(distance({ lat: 0, lon: 0 }, { lat: 0, lon: 1 }) - 111195) < 2);
});

test('statistics add recorded ascent and time without bridging segments', () => {
  const result = analyze([
    [{ lat: 0, lon: 0, elevation: 2, time: 0 }, { lat: 0, lon: 1, elevation: 8, time: 2000 }],
    [{ lat: 12, lon: 0, elevation: 20, time: 12000 }, { lat: 12, lon: 0, elevation: 17, time: 17000 }],
  ]);
  assert.equal(result.points, 4);
  assert.equal(result.gain, 6);
  assert.equal(result.duration, 7000);
  assert.equal(result.minimum, 2);
  assert.equal(result.maximum, 20);
  assert.equal(result.profile.length, 2);
  assert.ok(result.metres < 120000);
});

test('unknown measurements stay unavailable', () => {
  const result = analyze([[{ lat: 0, lon: 0, elevation: null, time: null }]]);
  assert.equal(result.gain, null);
  assert.equal(result.minimum, null);
  assert.equal(result.duration, null);
});

test('multiline geometry never joins independent parts', () => {
  const ground = geometryDistance({ type: 'MultiLineString', coordinates: [
    [[0, 0], [1, 0]], [[-100, 0], [-99, 0]],
  ] });
  assert.ok(Math.abs(ground - 222390) < 4);
});

test('municipal GPX preserves separate linework and documents the source without fabricated activity data', async () => {
  const {mappedTrack, municipalGpx} = await import('../web/track.mjs');
  const track = mappedTrack({geometry:{type:'MultiLineString',coordinates:[
    [[-63.6,44.7],[-63.59,44.69]],[[-63.5,44.6],[-63.49,44.6]],
  ]},properties:{id:'72', name:'Trail & Lake',type:'Trail',suggested:true}}, {
    publisher:'Municipality',title:'Trails',link:'https://example.org/?a=1&b=2',
    license:'Open data',license_link:'https://example.org/licence',retrieved:'2026-11-01',
  });
  const gpx = municipalGpx(track);
  assert.equal(track.segments.length, 2);
  assert.equal(analyze(track.segments).duration, null);
  assert.equal((gpx.match(/<trkseg>/g)||[]).length,2);
  assert.match(gpx, /Trail &amp; Lake/);
  assert.match(gpx, /a=1&amp;b=2/);
  assert.match(gpx, /record 72/);
  assert.match(gpx, /Suggested route/);
  assert.match(gpx, /lat="44.7" lon="-63.6"/);
  assert.doesNotMatch(gpx, /<(ele|time)>/);
});
