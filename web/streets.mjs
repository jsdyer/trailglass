// External street tiles are independent of the locally supplied data layers.
export function streetMap(map) {
  const layer = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>'
  });
  const notice = document.getElementById('tile-notice');
  layer.on('loading remove', () => { notice.hidden = true; });
  layer.on('tileerror', () => { if (map.hasLayer(layer)) notice.hidden = false; });
  document.getElementById('retry-tiles').addEventListener('click', () => {
    if (map.hasLayer(layer)) layer.redraw();
  });
  return layer;
}
