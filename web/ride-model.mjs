const dayMs=86400000;
const amount=x=>typeof x==='number'&&Number.isFinite(x)&&x>=0?x:null;
export function precipitationDays(payload,climate,now=Date.now()) {
 if(!Array.isArray(payload?.features))throw Error('Invalid daily observation response.');
 const byDay=new Map();
 for(const f of payload.features){const p=f.properties||{},day=String(p.LOCAL_DATE||'').slice(0,10);if(String(p.CLIMATE_IDENTIFIER)!==climate||!/^\d{4}-\d{2}-\d{2}$/.test(day))continue;
  const total=amount(p.TOTAL_PRECIPITATION),rain=amount(p.TOTAL_RAIN);if(total===null&&rain===null)continue;
  byDay.set(day,{day,total,rain,totalFlag:p.TOTAL_PRECIPITATION_FLAG||'',rainFlag:p.TOTAL_RAIN_FLAG||'',station:p.STATION_NAME||climate});}
 const days=[...byDay.values()].sort((a,b)=>b.day.localeCompare(a.day));const latest=days[0];
 if(!latest)return {days:[],latest:null,threeDay:null,old:false};
 const end=Date.parse(latest.day+'T12:00:00Z'),needed=[0,1,2].map(i=>new Date(end-i*dayMs).toISOString().slice(0,10));
 const complete=needed.map(d=>byDay.get(d));const threeDay=complete.every(d=>d&&d.total!==null&&!d.totalFlag)?Math.round(complete.reduce((s,d)=>s+d.total,0)*10)/10:null;
 return {days:days.slice(0,7),latest,threeDay,old:now-end>4*dayMs};
}
export function cityForecast(feature){const p=feature?.properties;if(!p||!Array.isArray(p.forecastGroup?.forecasts))throw Error('Forecast unavailable.');return {name:p.name?.en||'Regional forecast',issued:p.forecastGroup.timestamp?.en||'',periods:p.forecastGroup.forecasts.slice(0,4).map(f=>({name:f.period?.textForecastName?.en||f.period?.value?.en||'',text:f.textSummary?.en||''}))};}
export function roadEvents(payload){if(!Array.isArray(payload?.events))throw Error('Road report unavailable.');return {events:payload.events.filter(e=>e.status==='ACTIVE').sort((a,b)=>(b.severity==='MAJOR')-(a.severity==='MAJOR')||String(b.updated).localeCompare(String(a.updated))),limited:Boolean(payload.pagination?.next_url)};}
export function widgetURL(region,type){if(!Number.isInteger(region.rid)||!['region_status','trailreports'].includes(type))throw Error('Unknown widget');const u=new URL('https://www.trailforks.com/widgets/'+type+'/');u.search=new URLSearchParams(type==='region_status'?{rid:region.rid,status:1,st:1,date:1}:{rid:region.rid,d:1,c:1});return u.href;}
