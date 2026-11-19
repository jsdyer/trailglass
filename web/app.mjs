import {streetMap} from './streets.mjs';
import { analyze, geometryDistance, readGpx, mappedTrack, municipalGpx } from './track.mjs';

const el = id => document.getElementById(id);
const L = window.L;
const regions = {
  vancouver: { center: [49.266, -123.12], zoom: 12, query: 'Try Central Valley' },
  langley: { center: [49.1, -122.58], zoom: 11, query: 'Try Derby Hills' },
  halifax: { center: [44.67, -63.6], zoom: 11, query: 'Try Chain of Lakes' },
};
const colors = { published: '#2a664b', suggested: '#a94e21', selected: '#195a9b', track: '#7642a0' };
const cache = new Map();
const resultLimit = 24;
let visibleLimit = resultLimit;
let regionLoad = 0;
let fileLoad = 0;
let data;
let filtered = [];
let picked = null;
let routeLayer;
let gpxLayer;
let track;

const map = L.map(el('map'), { preferCanvas: true, scrollWheelZoom: false, minZoom: 2, maxZoom: 19 });
map.setView(regions.vancouver.center, regions.vancouver.zoom);
L.control.scale({ imperial: false }).addTo(map);
const street = streetMap(map);
let streetsPreferred = true;
const routePane = map.createPane('gpx');
routePane.style.zIndex = 450;

function node(tag, content, className) {
  const item = document.createElement(tag);
  if (content !== undefined) item.textContent = content;
  if (className) item.className = className;
  return item;
}

function number(value, digits = 0) {
  return value.toLocaleString('en-CA', { maximumFractionDigits: digits });
}

function length(metres) {
  return metres >= 1000 ? number(metres / 1000, 2) + ' km' : number(metres) + ' m';
}

function day(date) {
  return new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(date));
}

function anchor(label, href) {
  const a = node('a', label);
  a.href = href;
  return a;
}

function showSource(source) {
  const text = el('layers-source');
  text.replaceChildren('Source ', anchor(source.title + ' ↗', source.link), ' · ',
    anchor(source.license, source.license_link), '. ', source.updated ? 'Source updated ' + day(source.updated) + '. ' : '',
    'Snapshot retrieved ' + day(source.retrieved) + '.');
}

function style(feature) {
  const properties = feature.properties;
  const highlighted = picked === properties.id;
  return { color: highlighted ? colors.selected : properties.suggested ? colors.suggested : colors.published,
    weight: highlighted ? 6 : 3.3, opacity: highlighted ? 1 : .88, dashArray: properties.suggested ? '6 6' : undefined };
}

function details(feature) {
  const properties = feature.properties;
  const layout = node('div', undefined, 'segment-pop');
  layout.append(node('strong', properties.name));
  if (properties.street && properties.street !== properties.name) layout.append(node('span', properties.street));
  layout.append(node('span', [properties.type, properties.surface, properties.status].filter(Boolean).join(' · ')));
  layout.append(node('span', length(geometryDistance(feature.geometry)) + ' mapped'));
  if (properties.suggested) layout.append(node('span', 'Classified here as a suggested route.', 'suggested-text'));
  const inspect = node('button', 'Inspect and export segment', 'quiet');
  inspect.type = 'button';
  inspect.addEventListener('click', () => inspectMapped(feature));
  layout.append(inspect);
  return layout;
}

function selectSegment(layer, fit) {
  picked = layer.feature.properties.id;
  updateMappedButton(layer.feature);
  routeLayer.eachLayer(item => { item.setStyle(style(item.feature)); });
  layer.bringToFront();
  if (fit) {
    const bounds = layer.getBounds();
    map.fitBounds(bounds.pad(.15), { maxZoom: 16, padding: [21, 21], animate: false });
  }
  layer.openPopup();
}

function updateMappedButton(feature) {
  const button = el('inspect-mapped');
  button.disabled = !feature;
  button.textContent = feature ? 'Inspect ' + feature.properties.name : 'Inspect a map segment';
}

function inspectMapped(feature) {
  if (!data || !feature) return;
  fileLoad++;
  map.closePopup();
  setTrack(mappedTrack(feature, data.source));
  el('gpx-title').focus({preventScroll:true});
  el('gpx').scrollIntoView({block:'nearest'});
}

function renderMap() {
  if (routeLayer) routeLayer.remove();
  routeLayer = L.geoJSON(filtered, {
    style,
    onEachFeature(feature, layer) {
      layer.bindPopup(() => details(feature));
      layer.on('click', () => selectSegment(layer, false));
    },
  }).addTo(map);
}

function renderList() {
  const list = el('results');
  list.replaceChildren();
  el('more').hidden = filtered.length <= visibleLimit;
  if (!filtered.length) {
    list.append(node('li', 'No mapped segments match these filters.', 'empty'));
    return;
  }
  const layers = new Map(routeLayer.getLayers().map(layer => [layer.feature.properties.id, layer]));
  for (const feature of filtered.slice(0, visibleLimit)) {
    const props = feature.properties;
    const row = node('li');
    const button = node('button', undefined, 'segment');
    button.type = 'button';
    button.append(node('strong', props.name), node('span', [props.type, props.street === props.name ? '' : props.street,
      props.surface].filter(Boolean).join(' · ')));
    if (props.suggested) button.append(node('small', 'Suggested route'));
    button.addEventListener('click', () => {
      const layer = layers.get(props.id);
      if (!layer) return;
      selectSegment(layer, true);
      if (window.matchMedia('(max-width: 820px)').matches) el('map').scrollIntoView({ block: 'nearest' });
    });
    row.append(button);
    list.append(row);
  }
}

function fitResults() {
  const bounds = routeLayer?.getBounds();
  if (bounds?.isValid()) map.fitBounds(bounds, { maxZoom: 16, padding: [16, 16], animate: false });
  else {
    const location = regions[el('region').value];
    map.setView(location.center, location.zoom, { animate: false });
  }
}

function applyFilters(fit = false) {
  if (!data) return;
  const query = el('query').value.trim().toLocaleLowerCase('en-CA');
  const type = el('type').value;
  const surface = el('surface').value;
  const showSuggested = el('suggested-toggle').checked;
  visibleLimit = resultLimit;
  picked = null;
  filtered = data.features.filter(({ properties: props }) =>
    (!type || props.type === type) && (!surface || props.surface === surface) &&
    (showSuggested || !props.suggested) &&
    (!query || [props.name, props.street, props.type].filter(Boolean).join(' ').toLocaleLowerCase('en-CA').includes(query)));
  updateMappedButton(filtered[0]);
  const count = number(filtered.length);
  const suggested = filtered.filter(item => item.properties.suggested).length;
  el('summary').textContent = count + (filtered.length === 1 ? ' mapped segment' : ' mapped segments') +
    (suggested ? ' · ' + number(suggested) + ' suggested' : '') +
    (data.source.updated ? ' · source ' + day(data.source.updated) : '');
  renderMap();
  renderList();
  if (fit && !track) fitResults();
}

function picker(id, key, label) {
  const options = [...new Set(data.features.map(feature => feature.properties[key]).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  el(id).replaceChildren(new Option(label, ''), ...options.map(option => new Option(option, option)));
  return options.length;
}

async function loadRegion() {
  const region = el('region').value;
  const version = ++regionLoad;
  data = null;
  filtered = [];
  picked = null;
  updateMappedButton(null);
  el('summary').textContent = 'Loading ' + el('region').selectedOptions[0].textContent + ' routes…';
  el('query').value = '';
  el('query').placeholder = regions[region].query;
  el('results').replaceChildren();
  el('more').hidden = true;
  el('surface-field').hidden = true;
  el('suggested-filter').hidden = true;
  el('suggested-key').hidden = true;
  el('fit').disabled = true;
  routeLayer?.remove();
  el('layers-source').textContent = 'Loading municipal source details…';
  try {
    if (!cache.has(region)) {
      const result = await fetch('./data/' + region + '.json');
      if (!result.ok) throw new Error('HTTP ' + result.status);
      const payload = await result.json();
      if (payload.type !== 'FeatureCollection' || !payload.features?.length || !payload.source) throw new Error('Invalid snapshot');
      cache.set(region, payload);
    }
    if (version !== regionLoad) return;
    data = cache.get(region);
    picker('type', 'type', 'All facility types');
    el('surface-field').hidden = !picker('surface', 'surface', 'All reported surfaces');
    const suggestions = data.features.some(feature => feature.properties.suggested);
    el('suggested-toggle').checked = true;
    el('suggested-filter').hidden = !suggestions;
    el('suggested-key').hidden = !suggestions;
    showSource(data.source);
    applyFilters(true);
    el('fit').disabled = false;
  } catch {
    if (version !== regionLoad) return;
    el('summary').textContent = 'This municipal snapshot did not load. Try another layer or reload.';
    el('layers-source').textContent = 'The source snapshot is temporarily unavailable.';
  }
}

function toggleTiles() {
  if (el('tiles').checked && (!track || track.source)) street.addTo(map);
  else if (map.hasLayer(street)) street.remove();
}

function fitTrack() {
  if (gpxLayer?.getBounds().isValid()) {
    map.fitBounds(gpxLayer.getBounds(), { maxZoom: 17, padding: [22, 22], animate: false });
  }
}

function elapsed(milliseconds) {
  const seconds = Math.round(milliseconds / 1000);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return (hours ? hours + ' h ' : '') + minutes + ' min ' + (seconds % 60) + ' s';
}

const svgNS = 'http://www.w3.org/2000/svg';
function vector(tag, attributes, text) {
  const item = document.createElementNS(svgNS, tag);
  for (const [key, value] of Object.entries(attributes)) item.setAttribute(key, value);
  if (text) item.textContent = text;
  return item;
}

function elevationChart(stats) {
  const parent = el('elevation');
  parent.replaceChildren();
  if (!stats.elevationPoints) {
    parent.append(node('p', 'No elevation values were recorded in this file.', 'fine'));
    return;
  }
  const chart = vector('svg', { viewBox: '0 0 810 185', class: 'profile', role: 'img',
    'aria-label': 'Recorded elevation profile from ' + number(stats.minimum) + ' to ' + number(stats.maximum) + ' metres' });
  const min = stats.minimum;
  const max = Math.max(stats.maximum, min + 1);
  const x = m => 68 + 716 * m / Math.max(1, stats.metres);
  const y = metre => 141 - 118 * (metre - min) / (max - min);
  for (let i = 0; i <= 4; i++) {
    const elevation = min + i * (max - min) / 4;
    chart.append(vector('line', { x1: 62, x2: 790, y1: y(elevation), y2: y(elevation), class: 'grid' }),
      vector('text', { x: 5, y: y(elevation) + 4 }, number(elevation, 1) + ' m'));
  }
  for (const run of stats.profile) {
    const stride = Math.max(1, Math.floor(run.length / 1300));
    const points = run.filter((_, index) => index % stride === 0 || index === run.length - 1);
    if (points.length === 1) {
      chart.append(vector('circle', { cx: x(points[0][0]), cy: y(points[0][1]), r: 3, class: 'point' }));
    } else {
      chart.append(vector('polyline', { points: points.map(([m,e]) => x(m) + ',' + y(e)).join(' '), class: 'line' }));
    }
  }
  chart.append(vector('text', { x: 68, y: 172 }, 'Start'), vector('text', { x: 784, y: 172, 'text-anchor': 'end' }, length(stats.metres)));
  parent.append(chart);
}

function setTrack(input) {
  track = input;
  gpxLayer?.remove();
  // Leave any private extent before restoring requests to an external tile provider.
  street.remove();
  if (!track || track.source) {
    if (track) map.setView(regions[el('region').value].center, regions[el('region').value].zoom, {animate:false});
    else fitResults();
  }
  const privateTrack = Boolean(track && !track.source);
  el('tiles').checked = streetsPreferred && !privateTrack;
  el('tiles').disabled = privateTrack;
  toggleTiles();
  el('track-key').hidden = !track;
  el('fit-track').hidden = !track;
  el('clear').hidden = !track;
  el('gpx-output').hidden = !track;
  el('export-gpx').hidden = !track?.source;
  el('track-credit').hidden = !track?.source;
  el('track-legend').textContent = track?.source ? 'Inspected map segment' : 'Local GPX';
  if (!track) {
    el('map-hint').textContent = 'Street tiles from OpenStreetMap show roads and landmarks. They switch off before a local GPX is displayed.';
    el('gpx-status').textContent = 'Load a Garmin or other GPX activity to see distance, recorded ascent, elevation and elapsed time.';
    gpxLayer = null;
    return;
  }
  el('map-hint').textContent = privateTrack ? 'Local GPX view. Street tiles are off while your file is open.' : 'This segment comes from the public municipal route map.';
  if (track.source) {
    const source = track.source;
    el('track-credit').replaceChildren(source.publisher + ' · ', anchor(source.title, source.link),
      ' · record ' + track.recordId + (track.suggested ? ' · suggested route' : '') + ' · snapshot ' + day(source.retrieved) + ' · ',
      anchor(source.license, source.license_link), '. Municipal geometry supplies no activity times or elevation.');
  }
  const stats = analyze(track.segments);
  const lines = track.segments.filter(segment => segment.length > 1).map(segment => segment.map(point => [point.lat, point.lon]));
  gpxLayer = L.polyline(lines, { color: colors.track, weight: 5, opacity: .95, pane: 'gpx', interactive: false }).addTo(map);
  fitTrack();
  el('gpx-status').textContent = track.name + ' · ' + number(stats.points) + ' points · ' + track.segments.length +
    (track.segments.length === 1 ? ' segment' : ' segments') + '.';
  const facts = el('gpx-facts');
  facts.replaceChildren();
  for (const [key, value] of [
    [track.source ? 'Mapped distance' : 'Track distance', length(stats.metres)],
    ['Recorded ascent', stats.gain === null ? 'Unavailable' : number(stats.gain) + ' m'],
    ['Elevation range', stats.minimum === null ? 'Unavailable' : number(stats.minimum) + '–' + number(stats.maximum) + ' m'],
    ['Elapsed time', stats.duration === null ? 'Unavailable' : elapsed(stats.duration)],
  ]) {
    const pair = node('div');
    pair.append(node('dt', key), node('dd', value));
    facts.append(pair);
  }
  elevationChart(stats);
}

async function openTrack(contents) {
  const request = ++fileLoad;
  el('gpx-status').textContent = 'Reading GPX in this browser…';
  try {
    const next = readGpx(await contents);
    if (request === fileLoad) setTrack(next);
  } catch (error) {
    if (request === fileLoad) el('gpx-status').textContent = error.message || 'Could not read this track.';
  }
}

function download(blob, filename) {
  const href = URL.createObjectURL(blob);
  const link = anchor('', href);
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(href), 5000);
}

function exportTrack() {
  if (!track) return;
  const segments = track.segments.filter(segment => segment.length > 1);
  const data = { type: 'FeatureCollection', features: segments.map((segment, index) => ({
    type: 'Feature', properties: { name: track.name, segment: index + 1,
      ...(track.source ? {publisher:track.source.publisher, source:track.source.link, source_record:track.recordId,
        license:track.source.license_link, retrieved:track.source.retrieved, facility:track.facility, suggested:track.suggested} : {}) },
    geometry: { type: 'LineString', coordinates: segment.map(point => [point.lon, point.lat]) },
  })) };
  download(new Blob([JSON.stringify(data, null, 2)], {type:'application/geo+json'}), 'trailglass-track.geojson');
}

let queryTimer;
el('query').addEventListener('input', () => {
  clearTimeout(queryTimer);
  queryTimer = setTimeout(applyFilters, 140);
});
for (const id of ['type', 'surface', 'suggested-toggle']) el(id).addEventListener('change', () => applyFilters());
el('region').addEventListener('change', loadRegion);
el('fit').addEventListener('click', fitResults);
el('tiles').addEventListener('change', () => { streetsPreferred = el('tiles').checked; toggleTiles(); });
toggleTiles();
el('more').addEventListener('click', () => {
  visibleLimit += resultLimit;
  renderList();
  el('results').children[visibleLimit - resultLimit]?.querySelector('button')?.focus();
});
el('gpx-file').addEventListener('change', event => {
  const file = event.target.files[0];
  event.target.value = '';
  if (!file) return;
  if (file.size > 20 * 1024 * 1024) {
    fileLoad++;
    el('gpx-status').textContent = 'Choose a GPX file under 20 MB.';
    return;
  }
  openTrack(file.text());
});
el('inspect-mapped').addEventListener('click', () => {
  const feature = filtered.find(item => item.properties.id === picked) ?? filtered[0];
  inspectMapped(feature);
});
el('export-gpx').addEventListener('click', () => {
  if (!track?.source) return;
  const name = track.name.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'segment';
  download(new Blob([municipalGpx(track)], {type:'application/gpx+xml'}), name + '-' + track.recordId + '.gpx');
});
el('export-track').addEventListener('click', exportTrack);
el('fit-track').addEventListener('click', fitTrack);
el('clear').addEventListener('click', () => {
  fileLoad++;
  setTrack(null);
});
loadRegion();
