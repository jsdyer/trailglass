const EARTH_RADIUS_METRES = 6371008.8;
const radians = degrees => degrees * Math.PI / 180;

export function distance(a, b) {
  const dlat = radians(b.lat - a.lat);
  const dlon = radians(b.lon - a.lon);
  const term = Math.sin(dlat / 2) ** 2 + Math.cos(radians(a.lat)) * Math.cos(radians(b.lat)) * Math.sin(dlon / 2) ** 2;
  return 2 * EARTH_RADIUS_METRES * Math.asin(Math.min(1, Math.sqrt(term)));
}

const finite = value => typeof value === 'number' && Number.isFinite(value);
const numeric = value => value?.trim() ? Number(value) : NaN;

function children(node, name) {
  return [...node.children].filter(child => child.localName === name);
}
function childText(node, name) {
  return children(node, name)[0]?.textContent.trim();
}

function waypoint(node) {
  const lat = numeric(node.getAttribute('lat'));
  const lon = numeric(node.getAttribute('lon'));
  if (!finite(lat) || !finite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  const elevation = numeric(childText(node, 'ele'));
  const rawTime = childText(node, 'time');
  return { lat, lon, elevation: finite(elevation) ? elevation : null,
    time: rawTime && /(?:Z|[+-]\d{2}:\d{2})$/i.test(rawTime) ? Date.parse(rawTime) : null };
}

function splitPoints(nodes) {
  const runs = [];
  let run = [];
  for (const node of nodes) {
    const point = waypoint(node);
    if (point) run.push(point);
    else if (run.length) {
      runs.push(run);
      run = [];
    }
  }
  if (run.length) runs.push(run);
  return runs;
}

export function readGpx(text, Parser = DOMParser) {
  if (/<!(?:DOCTYPE|ENTITY)\b/i.test(text)) throw new Error('GPX documents with XML entity declarations are unsupported.');
  const root = new Parser().parseFromString(text, 'application/xml').documentElement;
  if (root?.localName !== 'gpx' || root.getElementsByTagNameNS('*', 'parsererror').length) throw new Error('Choose a well-formed GPX track or route.');
  const tracks = children(root, 'trk');
  const routes = children(root, 'rte');
  const segments = tracks.flatMap(track => children(track, 'trkseg').flatMap(segment => splitPoints(children(segment, 'trkpt'))))
    .concat(routes.flatMap(route => splitPoints(children(route, 'rtept'))));
  if (!segments.some(segment => segment.length > 1)) throw new Error('The GPX file has no track or route with two valid points.');
  if (segments.reduce((count, segment) => count + segment.length, 0) > 180000) throw new Error('This file is too large to inspect in one browser session.');
  return {
    name: childText(children(root, 'metadata')[0] || root, 'name') || childText(tracks[0] || routes[0], 'name') || 'GPX track',
    segments,
  };
}

export function analyze(segments) {
  let metres = 0;
  let gain = 0;
  let points = 0;
  let elevationPoints = 0;
  let ascentPairs = 0;
  let milliseconds = 0;
  let timedSegments = 0;
  let minimum = Infinity;
  let maximum = -Infinity;
  const profile = [];
  for (const segment of segments) {
    let previous = null;
    const firstTimed = segment.find(point => finite(point.time));
    const lastTimed = segment.findLast(point => finite(point.time));
    if (firstTimed && lastTimed && firstTimed !== lastTimed && lastTimed.time >= firstTimed.time) {
      milliseconds += lastTimed.time - firstTimed.time;
      timedSegments++;
    }
    const levels = [];
    for (const point of segment) {
      points++;
      if (previous) {
        metres += distance(previous, point);
        if (finite(previous.elevation) && finite(point.elevation)) {
          ascentPairs++;
          gain += Math.max(0, point.elevation - previous.elevation);
        }
      }
      if (finite(point.elevation)) {
        elevationPoints++;
        minimum = Math.min(minimum, point.elevation);
        maximum = Math.max(maximum, point.elevation);
        levels.push([metres, point.elevation]);
      } else if (levels.length) {
        profile.push(levels.splice(0));
      }
      previous = point;
    }
    if (levels.length) profile.push(levels);
  }
  return { metres, points, elevationPoints, gain: ascentPairs ? gain : null, timedSegments,
    duration: timedSegments ? milliseconds : null, minimum: elevationPoints ? minimum : null,
    maximum: elevationPoints ? maximum : null, profile };
}

export function geometryDistance(geometry) {
  const lines = geometry.type === 'LineString' ? [geometry.coordinates] : geometry.coordinates;
  return lines.reduce((sum, line) => sum + line.reduce((metres, coords, i) => {
    if (!i) return metres;
    const [lon, lat] = coords;
    const [lastLon, lastLat] = line[i - 1];
    return metres + distance({ lat, lon }, { lat: lastLat, lon: lastLon });
  }, 0), 0);
}

export function mappedTrack(feature, source) {
  const {name, id, type, suggested} = feature.properties;
  const geometry = feature.geometry;
  const lines = geometry.type === 'LineString' ? [geometry.coordinates] : geometry.coordinates;
  const segments = lines.map(line => line.map(([lon, lat]) => ({lon, lat, elevation:null, time:null})));
  return {name, segments, source, recordId:id, facility:type, suggested:!!suggested};
}

export function municipalGpx(track) {
  const escape = value => String(value).replace(/[&<>"']/g, character =>
    ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&apos;'})[character]);
  const source = track.source;
  const description = [source.publisher, source.title, 'record ' + track.recordId,
    track.facility, track.suggested && 'Suggested route', 'Snapshot ' + source.retrieved, source.license].filter(Boolean).join(' · ');
  const lines = ['<?xml version="1.0" encoding="UTF-8"?>',
    '<gpx version="1.1" creator="Trailglass" xmlns="http://www.topografix.com/GPX/1/1">',
    '<metadata><name>' + escape(track.name) + '</name><desc>' + escape(description) + '</desc>',
    '<link href="' + escape(source.link) + '"><text>' + escape(source.title) + '</text></link>',
    '<link href="' + escape(source.license_link) + '"><text>' + escape(source.license) + '</text></link></metadata>',
    '<trk><name>' + escape(track.name) + '</name>'];
  for (const segment of track.segments) {
    lines.push('<trkseg>');
    for (const point of segment) lines.push('<trkpt lat="' + point.lat + '" lon="' + point.lon + '"/>');
    lines.push('</trkseg>');
  }
  lines.push('</trk></gpx>');
  return lines.join('\n');
}
