import {distance} from './track.mjs';
const finite = x => typeof x === 'number' && Number.isFinite(x);

export function sampleTerrain(segments, limit=100) {
  const runs=segments.filter(s=>s.length>1).map(points=>{
    const positions=[0]; for(let i=1;i<points.length;i++) positions.push(positions[i-1]+distance(points[i-1],points[i]));
    return {points,positions,length:positions.at(-1),count:2};
  }).filter(s=>s.length>0);
  if (!runs.length) throw new Error('This track has no measurable route.');
  if (runs.length*2>limit) throw new Error('Choose a track with at most 50 segments for the terrain estimate.');
  limit=Math.min(limit,Math.max(runs.length*2,Math.ceil(runs.reduce((n,r)=>n+r.length,0)/90)+runs.length));
  while(runs.reduce((n,r)=>n+r.count,0)<limit) runs.reduce((a,b)=>a.length/(a.count-1)>b.length/(b.count-1)?a:b).count++;
  let offset=0;
  return runs.map(run=>{
    let cursor=1;
    const samples=Array.from({length:run.count},(_,i)=>{
      const at=run.length*i/(run.count-1);
      while(cursor<run.points.length-1 && run.positions[cursor]<at) cursor++;
      const a=run.points[cursor-1], b=run.points[cursor];
      const ratio=(at-run.positions[cursor-1])/Math.max(.00001,run.positions[cursor]-run.positions[cursor-1]);
      return {lat:a.lat+(b.lat-a.lat)*ratio,lon:a.lon+(b.lon-a.lon)*ratio,metres:offset+at};
    });offset+=run.length;return samples;
  });
}

export function terrainProfile(segments, elevations) {
  if(elevations.length!==segments.flat().length || elevations.some(x=>!finite(x))) throw new Error('The elevation service returned incomplete values.');
  let cursor=0, gain=0;
  const profile=segments.map(run=>run.map((point,i)=>{const elevation=elevations[cursor++];if(i)gain+=Math.max(0,elevation-elevations[cursor-2]);return [point.metres,elevation];}));
  return {profile,gain,metres:segments.at(-1).at(-1).metres,elevationPoints:elevations.length,minimum:Math.min(...elevations),maximum:Math.max(...elevations)};
}

export function gradeSections(profile, window=100, threshold=8) {
  const result=[];
  profile.forEach((run,segment)=>{
    let start=0;
    for(let i=1;i<run.length;i++) {
      const span=run[i][0]-run[start][0];
      if(span<window)continue;
      const grade=100*(run[i][1]-run[start][1])/span;
      if(Math.abs(grade)>=threshold)result.push({segment:segment+1,start:run[start][0],end:run[i][0],grade});
      start=i;
    }
  });
  return result.sort((a,b)=>Math.abs(b.grade)-Math.abs(a.grade)).slice(0,20);
}
