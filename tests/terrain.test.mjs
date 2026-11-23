import test from 'node:test';import assert from 'node:assert/strict';
import {sampleTerrain,terrainProfile,gradeSections} from '../web/terrain.mjs';
test('terrain samples preserve segment boundaries, endpoints and route distance',()=>{
 const samples=sampleTerrain([[{lat:49,lon:-123},{lat:49.01,lon:-123}],[{lat:50,lon:-123},{lat:50.01,lon:-123}]],10);
 assert.equal(samples.flat().length,10);assert.equal(samples[0][0].lat,49);assert.equal(samples[1][0].lat,50);
 const profile=terrainProfile(samples,[0,10,20,30,40,100,100,100,100,100]);
 assert.equal(profile.gain,40);assert.equal(profile.minimum,0);assert.equal(profile.profile.length,2);
 assert.throws(()=>terrainProfile(samples,[null]));
});
test('grade windows never bridge elevation gaps or separate segments',()=>{
 assert.deepEqual(gradeSections([[[0,0],[50,100]],[[200,200],[250,400]]]),[]);
 const out=gradeSections([[[0,0],[100,10],[200,0]]]);assert.equal(out.length,2);assert.equal(out[0].grade,10);assert.equal(out[1].grade,-10);
});
