#!/usr/bin/env python3
"""Read-only GTM coverage audit of every sitemap page and private route samples."""
import argparse
from concurrent.futures import ThreadPoolExecutor
from html.parser import HTMLParser
import json
from urllib.error import HTTPError
from urllib.parse import urljoin, urlsplit
from urllib.request import Request, urlopen
import xml.etree.ElementTree as ET

CONTAINER = "GTM-MLVF9PP3"
PRIVATE = ["/crm/", "/crm/mobile/", "/quote/gtm-verification-invalid-token/",
           "/autopay/gtm-verification-invalid-token/", "/installer-form/gtm-verification-invalid-token/",
           "/quote/sketch-catalog/", "/quote-lab/", "/staff-booking-sms/"]


class Snippets(HTMLParser):
    def __init__(self):
        super().__init__()
        self.in_head = False
        self.in_noscript = False
        self.head_scripts = 0
        self.body_iframes = 0

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == "head":
            self.in_head = True
        if tag == "noscript":
            self.in_noscript = True
        if tag == "script" and attrs.get("id") == "805-gtm":
            self.head_scripts += 1 if self.in_head else 100
        if tag == "iframe" and attrs.get("src") == f"https://www.googletagmanager.com/ns.html?id={CONTAINER}":
            self.body_iframes += 1 if self.in_noscript and not self.in_head else 100

    def handle_endtag(self, tag):
        if tag == "head":
            self.in_head = False
        if tag == "noscript":
            self.in_noscript = False


def fetch(url):
    try:
        response = urlopen(Request(url, headers={"User-Agent": "805-GTM-Verification/1.0"}), timeout=40)
    except HTTPError as error:
        response = error
    with response:
        return response.status, response.read().decode("utf-8", "replace")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", required=True)
    args = parser.parse_args()
    base = args.base_url.rstrip("/")
    status, sitemap = fetch(base + "/sitemap.xml")
    if status != 200:
        raise SystemExit(f"Sitemap HTTP {status}")
    # Only page locations, not nested image:loc entries.
    paths = sorted({urlsplit(node.text).path
                    for node in ET.fromstring(sitemap).findall("{*}url/{*}loc")})
    if not paths:
        raise SystemExit("Sitemap contained no pages")

    def check(item):
        path, public = item
        status, html = fetch(urljoin(base + "/", path))
        snippets = Snippets()
        snippets.feed(html)
        expected = 1 if public else 0
        passed = status in ([200] if public else [200, 401, 403, 404]) and (
            snippets.head_scripts == snippets.body_iframes == expected)
        return {"path": path, "status": status, "head_scripts": snippets.head_scripts,
                "noscript_iframes": snippets.body_iframes, "passed": passed}

    with ThreadPoolExecutor(max_workers=6) as pool:
        results = list(pool.map(check, [(path, True) for path in paths] + [(path, False) for path in PRIVATE]))
    failures = [row for row in results if not row["passed"]]
    print(json.dumps({"base_url": base, "container": CONTAINER, "public_pages": len(paths),
                      "private_samples": len(PRIVATE), "failures": failures, "results": results}, indent=2))
    return bool(failures)


if __name__ == "__main__":
    raise SystemExit(main())
