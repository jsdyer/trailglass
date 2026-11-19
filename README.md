# Trailglass

A static map and private GPX inspector for municipal routes in Vancouver, the Township of Langley and Halifax. Search by route name, street or type. Vancouver adds a filter for reported surfaces. Halifax suggested routes use an orange dashed line and have a toggle. Select a result to fit the map to that segment.

## Inspect and download mapped segments

<!-- coolcode:guide -->
Select a map segment to download its GPX with the municipality, source record and licence. The inspector also reads local GPX activities with recorded times and elevations.
<!-- /coolcode:guide -->

For example, search Vancouver for Central Valley and open a segment. Choose **Inspect and export segment** in its map popup to see its mapped length and point count. **Download mapped segment GPX** saves its lines to a GPX 1.1 track. Disconnected parts remain separate. The GPX also records the dataset, municipal record ID, snapshot date, licence and whether Halifax marks a line as suggested. Its coordinates describe one published feature. Time and elevation only appear for imported files that supply those measurements. Downloading the GeoJSON also preserves municipal provenance.

## Build and test

1. Run `python3 scripts/build.py` to download and validate municipal snapshots, trim their geometry fields and bundle Leaflet locally in `dist/`.
2. Run `node --test tests/track.test.mjs` to test distance and activity statistics.
3. Serve with `python3 -m http.server 8000 --directory dist` for a local preview.

The build keeps dated extracts under `.cache/` and reuses them if a subsequent download fails. Use `--offline` with existing extracts. Attribution and both source and retrieval dates are displayed when available.

## Sources

- [City of Vancouver Bikeways](https://opendata.vancouver.ca/explore/dataset/bikeways/), [Open Government Licence – Vancouver](https://opendata.vancouver.ca/pages/licence/).
- [Township of Langley Trails](https://data-tol.opendata.arcgis.com/datasets/db1c6b25041447f19b0bc7a0fa4e4f82_0), [Open Government Licence – Township of Langley](https://www.tol.ca/en/connect/open-data-licence.aspx).
- [Halifax Regional Municipality Bike Infrastructure and Suggested Routes](https://data-hrm.hub.arcgis.com/datasets/HRM::bike-infrastructure-and-suggested-routes), [HRM Open Data Licence](https://data-hrm.hub.arcgis.com/pages/open-data-licence).
- [Leaflet](https://leafletjs.com/) is pinned and bundled under the BSD 2-Clause licence. The optional public background uses [OpenStreetMap tiles](https://operations.osmfoundation.org/policies/tiles/) with on-map attribution.

Trail line geometry shows source-mapped segments with approximate positions. Township of Langley trails vary in allowed use. The map provides exploration and links to source records. Cycling access, temporary closures and turn-by-turn navigation need separate information.

## GPX privacy

Your browser reads GPX route and track points. Files, coordinates and calculated statistics stay in the tab. The optional external street tiles are switched off before fitting a GPX and remain off while the track is open. The application has no analytics. Distances use haversine segment lengths. Elevation gain sums positive changes in recorded elevation and is sensitive to sample noise. Elapsed time sums intervals within timed segments, excluding gaps between segments. GPX GeoJSON export includes the local track coordinates.
