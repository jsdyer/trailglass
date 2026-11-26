"""Check real municipal GPX exports and local GPX import in Chromium."""
import json
import os
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

from playwright.sync_api import sync_playwright

root = Path(__file__).resolve().parents[1]
gpx_ns = {"g": "http://www.topografix.com/GPX/1/1"}
with sync_playwright() as playwright:
    browser = playwright.chromium.launch(executable_path=os.environ.get("CHROMIUM_PATH"))
    for width, region in [(1200, "vancouver"), (390, "halifax"), (1200, "langley")]:
        page = browser.new_page(viewport={"width": width, "height": 900}, accept_downloads=True)
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.route("https://tile.openstreetmap.org/**", lambda route: route.abort())
        page.goto(sys.argv[1])
        assert page.locator('#ride-widgets iframe').count()==0
        if region=='vancouver':
            page.route('https://api.weather.gc.ca/collections/climate-daily/**',lambda route:route.fulfill(json={'features':[{'properties':{'LOCAL_DATE':'2026-11-24 00:00:00','CLIMATE_IDENTIFIER':'1108824','TOTAL_PRECIPITATION':18.3,'TOTAL_RAIN':None}}]}))
            page.route('https://api.weather.gc.ca/collections/citypageweather-realtime/**',lambda route:route.fulfill(json={'properties':{'name':{'en':'West Vancouver'},'forecastGroup':{'timestamp':{'en':'2026-11-26T04:00:00Z'},'forecasts':[{'period':{'textForecastName':{'en':'Tonight'}},'textSummary':{'en':'Periods of rain.'}}]}}}))
            page.route('https://api.open511.gov.bc.ca/**',lambda route:route.fulfill(json={'events':[{'status':'ACTIVE','headline':'Highway closure fixture','description':'Test road report','updated':'2026-11-26T03:00:00Z','severity':'MAJOR'}]}))
            page.locator('#ride-load').click()
            page.wait_for_function("document.querySelector('#ride-rain').textContent.includes('18.3 mm')")
            assert 'Rain-only total not supplied' in page.locator('#ride-rain').inner_text()
            assert 'Highway closure fixture' in page.locator('#ride-roads').inner_text()
            page.route('https://www.trailforks.com/**',lambda route:route.fulfill(content_type='text/html',body='<p>Official widget fixture</p>'))
            page.locator('#ride-widget-load').click()
            assert page.locator('#ride-widgets iframe').count()==2
            assert 'rid=3009' in page.locator('#ride-widgets iframe').first.get_attribute('src')
            page.select_option('#ride-region','whistler')
            assert page.locator('#ride-widgets iframe').count()==0
            assert page.locator('#ride-rain').inner_text()==''
            page.route('https://api.open511.gov.bc.ca/**',lambda route:route.fulfill(status=503,body='Unavailable'))
            page.locator('#ride-load').click()
            page.wait_for_function("document.querySelector('#ride-roads').textContent.includes('source is unavailable')")
        page.locator("#region").select_option(region)
        page.locator("#results .segment").first.wait_for()
        page.locator("#tile-notice").wait_for()
        page.unroute("https://tile.openstreetmap.org/**")
        tile = '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#cadfc9"/></svg>'
        page.route("https://tile.openstreetmap.org/**", lambda route: route.fulfill(content_type="image/svg+xml", body=tile))
        page.locator("#retry-tiles").click()
        page.wait_for_selector("img.leaflet-tile-loaded")
        assert page.locator("#tile-notice").is_hidden()
        page.locator("#results .segment").nth(1).click()
        page.get_by_role("button", name="Inspect and export segment").click()
        credit = page.locator("#track-credit").inner_text()
        snapshot = json.loads((root / "dist/data" / (region + ".json")).read_text())
        assert snapshot["source"]["publisher"] in credit
        with page.expect_download() as download:
            page.locator("#export-gpx").click()
        exported = Path(download.value.path()).read_bytes()
        xml = ET.fromstring(exported)
        description = xml.findtext("g:metadata/g:desc", namespaces=gpx_ns)
        record = description.split(" · record ")[1].split(" · ")[0]
        original = next(f for f in snapshot["features"] if f["properties"]["id"] == record)
        geometry = original["geometry"]
        lines = geometry["coordinates"] if geometry["type"] == "MultiLineString" else [geometry["coordinates"]]
        segments = xml.findall("g:trk/g:trkseg", gpx_ns)
        actual = [[[float(p.attrib["lon"]), float(p.attrib["lat"])] for p in seg] for seg in segments]
        assert actual == lines
        assert xml.findtext("g:trk/g:name", namespaces=gpx_ns) == original["properties"]["name"]
        assert page.locator("#tiles").is_checked()
        assert "Unavailable" in page.locator("#gpx-facts").inner_text()
        with page.expect_download() as download:
            page.locator("#export-track").click()
        geo = json.loads(Path(download.value.path()).read_bytes())
        assert [f["geometry"]["coordinates"] for f in geo["features"]] == lines
        assert all(f["properties"]["source_record"] == record for f in geo["features"])
        page.locator("#clear").click()
        page.locator("#gpx-file").set_input_files({"name":"roundtrip.gpx", "mimeType":"application/gpx+xml", "buffer":exported})
        page.locator("#gpx-output").wait_for()
        assert page.locator("#track-credit").is_hidden() and page.locator("#export-gpx").is_hidden()
        assert original["properties"]["name"] in page.locator("#gpx-status").inner_text()
        assert page.locator("#tiles").is_disabled() and not page.locator("#map .leaflet-tile").count()
        page.locator("#clear").click()
        assert page.locator("#tiles").is_checked()
        assert page.evaluate("document.documentElement.scrollWidth <= innerWidth")
        assert not errors, errors
        page.close()
print("Verified municipal source geometry, attribution, GPX/GeoJSON export and local GPX round trips in all three regions.")
