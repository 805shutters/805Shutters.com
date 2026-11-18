"""Export published WordPress REST records for review before a Vercel release."""
import json
import os
import subprocess
import sys
from xml.etree import ElementTree
from http.cookiejar import CookieJar
from urllib import parse, request

def from_wxr(filename):
    wp = "{http://wordpress.org/export/1.2/}"
    content = "{http://purl.org/rss/1.0/modules/content/}encoded"
    excerpt = "{http://wordpress.org/export/1.2/excerpt/}encoded"
    from html import escape
    records = []
    for item in ElementTree.parse(filename).findall("./channel/item"):
        if item.findtext(wp + "post_type") != "page" or item.findtext(wp + "status") != "publish":
            continue
        records.append({
            "slug": item.findtext(wp + "post_name"),
            "title": {"rendered": escape(item.findtext("title", ""))},
            "content": {"rendered": item.findtext(content, ""), "protected": bool(item.findtext(wp + "post_password"))},
            "excerpt": {"rendered": item.findtext(excerpt, "")}
        })
    return records


def from_rest():
    base = os.getenv("WORDPRESS_REST_PAGES")
    if base:
        if parse.urlsplit(base).scheme != "https":
            raise ValueError("Hosted WordPress REST endpoints must use HTTPS")
        client = request.build_opener()
    else:
        client = request.build_opener(request.HTTPCookieProcessor(CookieJar()))
        client.open("http://127.0.0.1:9428/", timeout=30).close()
        base = "http://127.0.0.1:9428/?rest_route=/wp/v2/pages"

    records = []
    page = 1
    while True:
        query = parse.urlencode({"status": "publish", "per_page": 100, "page": page,
                                 "_fields": "slug,title,content,excerpt,modified_gmt"})
        with client.open(base + ("&" if "?" in base else "?") + query, timeout=60) as response:
            records.extend(json.load(response))
            if page >= int(response.headers["X-WP-TotalPages"]):
                break
        page += 1
    return records


records = from_wxr(sys.argv[1]) if len(sys.argv) == 2 else from_rest()
subprocess.run(["node", "scripts/wordpress/export.mjs"], input=json.dumps(records), text=True, check=True)
