# Trailglass

A static map and private GPX inspector for municipal routes in Vancouver, the Township of Langley and Halifax. Search by route name, street or type. Vancouver adds a filter for reported surfaces. Halifax suggested routes use an orange dashed line and have a toggle. Select a result to fit the map to that segment.

## Inspect and download mapped segments

<!-- coolcode:guide -->
Select a municipal segment or open a local GPX to inspect distance, recorded elevations and steep sections. You can explicitly send up to 100 sampled coordinates for a separate Open-Meteo terrain profile. The roughly 90 m terrain model does not replace recorded elevations and can miss bridges, tunnels and small climbs.
For BC riding regions, **Before you ride** loads recent ECCC station precipitation, dated regional forecasts and DriveBC road events. Trailforks status and report widgets load separately when requested.
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
- [Leaflet](https://leafletjs.com/) is pinned and bundled under the BSD 2-Clause licence. The default street background uses [OpenStreetMap tiles](https://operations.osmfoundation.org/policies/tiles/) with on-map attribution.

Trail line geometry shows source-mapped segments with approximate positions. Township of Langley trails vary in allowed use. The map provides exploration and links to source records. Cycling access, temporary closures and turn-by-turn navigation need separate information.

## GPX privacy

Your browser reads GPX route and track points. Files, coordinates and calculated statistics stay in the tab. OpenStreetMap receives the public map viewport. Street tiles stay visible for public municipal segments. The app turns them off before fitting an imported GPX and restores your previous choice after returning to a public extent. CoolCode counts page opens by tool ID. Counts exclude GPX details and map locations. Distances use haversine segment lengths. Elevation gain sums positive changes in recorded elevation and is sensitive to sample noise. Elapsed time sums intervals within timed segments, excluding gaps between segments. GPX GeoJSON export includes the local track coordinates.


## Added browser workflow

Select a municipal segment or open a local GPX to inspect distance, recorded elevations and steep sections. You can explicitly send up to 100 sampled coordinates for a separate Open-Meteo terrain profile. The roughly 90 m terrain model does not replace recorded elevations and can miss bridges, tunnels and small climbs.

<!-- schedule-reliability -->
## Schedule reliability

Public GitHub repositories can have scheduled workflows disabled after 60 days of inactivity. A separate weekly [schedule guard](.github/workflows/schedule-guard.yml) calls GitHub's enable-workflow API for an explicit list of refresh workflows and itself. It can restore workflows disabled for inactivity, preserves manually disabled workflows, and runs independently of collection failures.

This is an interim mitigation, not a scheduling guarantee: GitHub does not document active-workflow renewal as a permanent exemption, and scheduled runs can be delayed or dropped. A scheduler on our own Linux server is the planned independent trigger. The guard does not collect data, create dummy commits, or change source/check timestamps; successful collection and published data freshness still need monitoring.
<!-- /schedule-reliability -->

## BC conditions and official Trailforks embeds

The five presets are North Shore (Trailforks 3009), Squamish (3012), Whistler (3010), Southern Sunshine Coast (3013) and Abbotsford (3259). IDs were checked on the corresponding official region pages on 2026-11-26. `web/ride-regions.mjs` holds the public region IDs, ECCC forecast cities, climate identifiers and road bounding boxes. Abbotsford does not claim to cover the entire Fraser Valley.

The browser requests ECCC city forecasts, ECCC climate-daily station observations and DriveBC Open511 events only after **Load weather & roads**. It displays source observation dates separately from retrieval time. Daily precipitation includes water-equivalent snow; rain is displayed separately when provided. Null is never converted to zero. A three-day total requires three consecutive unflagged daily totals. Old or incomplete measurements remain explicit. Lowland stations cannot establish conditions on a mountain trail.

Trailforks is embedded through its official [region status](https://www.trailforks.com/widgets/config/region_status/) and [trail reports](https://www.trailforks.com/widgets/config/trailreports/) widgets. These load only on request; branding and source links stay visible. No Trailforks API, scraping, copied catalogue or API key is used. Blocked widgets retain an ordinary region link. Weather and road requests are independent of GPX inspection and do not send a GPX location.

Source schemas: [ECCC OGC API](https://eccc-msc.github.io/open-data/msc-geomet/ogc_api_en/) and [DriveBC Open511](https://api.open511.gov.bc.ca/help). No Worker change, secret or additional refresh schedule is needed. Run `node --test tests/*.test.mjs` for the precipitation completeness, widget boundaries and existing track calculations.
