#!/usr/bin/env python3
"""Create compact municipal route extracts and bundle Leaflet for GitHub Pages."""
from argparse import ArgumentParser
from base64 import b64encode
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from hashlib import sha512
from io import BytesIO
from pathlib import Path
from shutil import copytree, rmtree
from tarfile import open as tar_open
from urllib.parse import urlencode
from urllib.request import Request, urlopen
import json
import math

ROOT = Path(__file__).resolve().parents[1]
VAN = "https://opendata.vancouver.ca/api/explore/v2.1/catalog/datasets/bikeways"
LANG = "https://services5.arcgis.com/frpHL0Fv8koQRVWY/arcgis/rest/services/Trails/FeatureServer/0"
HALIFAX = ("https://services2.arcgis.com/11XBiaBYA9Ep0yNJ/ArcGIS/rest/services/"
           "Bike_Infrastructure_and_Suggested_Routes/FeatureServer/0")
LIBRARY = "https://registry.npmjs.org/leaflet/-/leaflet-1.9.4.tgz"
INTEGRITY = "nxS1ynzJOmOlHp+iL3FyWqK89GtNL8U8rvlMOsQdTTssxZwCXh8N2NB3GDQOL+YR3XnWyZAxwQixURb+FA74PA=="
SUGGESTED = {"BRLOCALRD", "BRMAINRD", "SCDAYLP", "HELPCONN"}
SOURCES = {
    "vancouver": {
        "name": "Vancouver", "publisher": "City of Vancouver",
        "title": "Vancouver Bikeways", "link": "https://opendata.vancouver.ca/explore/dataset/bikeways/",
        "license": "Open Government Licence – Vancouver", "license_link": "https://opendata.vancouver.ca/pages/licence/",
    },
    "langley": {
        "name": "Township of Langley", "publisher": "Township of Langley",
        "title": "Township of Langley Trails", "link": "https://data-tol.opendata.arcgis.com/datasets/db1c6b25041447f19b0bc7a0fa4e4f82_0",
        "license": "Open Government Licence – Township of Langley", "license_link": "https://www.tol.ca/en/connect/open-data-licence.aspx",
    },
    "halifax": {
        "name": "Halifax", "publisher": "Halifax Regional Municipality",
        "title": "Halifax Bike Infrastructure and Suggested Routes",
        "link": "https://data-hrm.hub.arcgis.com/datasets/HRM::bike-infrastructure-and-suggested-routes",
        "license": "Open Data Licence – Halifax Regional Municipality", "license_link": "https://data-hrm.hub.arcgis.com/pages/open-data-licence",
    },
}


def timestamp():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def download(base, params=None, max_bytes=30_000_000):
    url = base + ("?" + urlencode(params) if params else "")
    request = Request(url, headers={"User-Agent": "CoolCode Trailglass build (+https://coolcode.ca/trailglass/)"})
    with urlopen(request, timeout=45) as response:
        data = response.read(max_bytes + 1)
    if len(data) > max_bytes:
        raise ValueError(f"Unexpected response size from {url}")
    return data


def api(base, **params):
    result = json.loads(download(base, params))
    if result.get("error"):
        raise ValueError(f"{base}: {result['error']}")
    return result


def as_day(value):
    return datetime.fromtimestamp(value / 1000, tz=timezone.utc).date().isoformat() if value else None


def line_geometry(geometry):
    if not geometry or geometry.get("type") not in {"LineString", "MultiLineString"}:
        return None
    coordinates = geometry["coordinates"]
    lines = [coordinates] if geometry["type"] == "LineString" else coordinates
    valid = []
    for line in lines:
        if len(line) >= 2:
            points = []
            for point in line:
                lon, lat = point[:2]
                if not (math.isfinite(lon) and math.isfinite(lat) and -180 <= lon <= 180 and -90 <= lat <= 90):
                    raise ValueError("Coordinate outside expected longitude/latitude range")
                points.append([round(lon, 6), round(lat, 6)])
            valid.append(points)
    if len(valid) == 1:
        return {"type": "LineString", "coordinates": valid[0]}
    return {"type": "MultiLineString", "coordinates": valid} if valid else None


def vancouver():
    source = api(VAN)["metas"]["default"]
    export = api(VAN + "/exports/geojson")
    rows = export["features"]
    if len(rows) < source["records_count"] * .95:
        raise ValueError("Vancouver export appears truncated")
    return source["modified"][:10], rows, {}


def arcgis(base, fields):
    meta = api(base, f="json")
    count = api(base + "/query", f="json", where="1=1", returnCountOnly="true")["count"]
    page = min(500, meta["maxRecordCount"])
    rows = []
    for offset in range(0, count, page):
        group = api(base + "/query", f="geojson", where="1=1", outSR=4326,
                    outFields=",".join(fields), resultOffset=offset, resultRecordCount=page,
                    orderByFields=meta["objectIdField"])
        rows.extend(group["features"])
    ids = {row["properties"][meta["objectIdField"]] for row in rows}
    if len(ids) != count or len(rows) != count:
        raise ValueError(f"ArcGIS count and export differ for {base}")
    domains = {field["name"]: {entry["code"]: entry["name"] for entry in (field.get("domain") or {}).get("codedValues", [])}
               for field in meta["fields"]}
    return as_day(meta.get("editingInfo", {}).get("dataLastEditDate")), rows, domains


def properties(region, raw, domains):
    if region == "vancouver":
        return {
            "id": str(raw["object_id"]), "name": raw.get("bike_route_name") or raw.get("street_name") or "Unnamed bikeway",
            "street": raw.get("street_name"), "type": raw.get("bikeway_type") or "Unclassified",
            "surface": raw.get("surface_type"), "status": raw.get("status"),
        }
    if region == "langley":
        return {"id": str(raw["OBJECTID"]), "name": raw.get("TrailName") or "Unnamed trail", "type": "Mapped trail"}
    kind = raw.get("BIKETYPE")
    return {"id": str(raw["OBJECTID"]), "name": raw.get("BIKE_NAME") or raw.get("STREETNAME") or "Unnamed bikeway",
            "street": raw.get("STREETNAME"), "type": domains.get("BIKETYPE", {}).get(kind, kind) or "Unclassified",
            "suggested": kind in SUGGESTED,
            "status": domains.get("IMPLEMENT", {}).get(raw.get("IMPLEMENT"))}


def collect(region):
    if region == "vancouver":
        source_day, rows, domains = vancouver()
    elif region == "langley":
        source_day, rows, domains = arcgis(LANG, ("OBJECTID", "TrailName"))
    else:
        source_day, rows, domains = arcgis(HALIFAX, ("OBJECTID", "BIKETYPE", "BIKE_NAME", "STREETNAME", "IMPLEMENT", "MODDATE"))
        edits = [row["properties"].get("MODDATE") for row in rows if row["properties"].get("MODDATE")]
        if not source_day and edits:
            source_day = as_day(max(edits))
    keep = []
    for feature in rows:
        geometry = line_geometry(feature.get("geometry"))
        if geometry:
            prop = {key: value for key, value in properties(region, feature["properties"], domains).items() if value}
            keep.append({"type": "Feature", "properties": prop, "geometry": geometry})
    if not keep or len(keep) < len(rows) * .9:
        raise ValueError(f"{region}: source geometry is missing")
    return {"type": "FeatureCollection", "features": keep,
            "source": {**SOURCES[region], "updated": source_day, "retrieved": timestamp()}}


def get_region(region, cache, offline):
    path = cache / (region + ".json")
    if not offline:
        try:
            payload = collect(region)
            temporary = path.with_suffix(".tmp")
            temporary.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
            temporary.replace(path)
            return payload
        except (OSError, KeyError, TypeError, ValueError) as error:
            if not path.exists():
                raise
            print(f"{region}: retaining dated local extract after refresh failure: {error}")
    return json.loads(path.read_text(encoding="utf-8"))


def vendor(cache, output):
    path = cache / "leaflet-1.9.4.tgz"
    body = path.read_bytes() if path.exists() else download(LIBRARY, max_bytes=4_000_000)
    if b64encode(sha512(body).digest()).decode() != INTEGRITY:
        raise ValueError("Leaflet package failed integrity verification")
    if not path.exists():
        path.write_bytes(body)
    output.mkdir()
    (output / "images").mkdir()
    with tar_open(fileobj=BytesIO(body), mode="r:gz") as archive:
        for member in ("leaflet.js", "leaflet.css", "images/marker-icon.png",
                       "images/marker-icon-2x.png", "images/marker-shadow.png", "images/layers.png", "images/layers-2x.png"):
            (output / member).write_bytes(archive.extractfile("package/dist/" + member).read())
        (output / "LEAFLET-LICENSE").write_bytes(archive.extractfile("package/LICENSE").read())


def main():
    parser = ArgumentParser(description=__doc__)
    parser.add_argument("--offline", action="store_true", help="Build from existing dated municipal extracts")
    args = parser.parse_args()
    cache = ROOT / ".cache"
    cache.mkdir(exist_ok=True)
    with ThreadPoolExecutor(max_workers=3) as pool:
        regions = list(pool.map(lambda region: get_region(region, cache, args.offline), SOURCES))
    dist = ROOT / "dist"
    rmtree(dist, ignore_errors=True)
    copytree(ROOT / "web", dist)
    vendor(cache, dist / "vendor")
    output = dist / "data"
    output.mkdir()
    for region, data in zip(SOURCES, regions):
        (output / (region + ".json")).write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        print(f"{region}: {len(data['features'])} segments")


if __name__ == "__main__":
    main()
