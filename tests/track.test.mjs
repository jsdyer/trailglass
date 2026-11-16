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
