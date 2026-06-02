#!/usr/bin/env python3
"""Create or update a WordPress page from a local HTML file.

Required environment variables:
  WP_USER
  WP_APP_PASSWORD

Optional:
  WP_BASE_URL defaults to https://www.805shutters.com

Example:
  WP_USER=admin WP_APP_PASSWORD='xxxx xxxx xxxx xxxx xxxx xxxx' \
  python3 scripts/publish_wp_page.py \
    --slug free-window-treatment-consultation \
    --title 'Free Window Treatment Consultation in Ventura County' \
    --content-file content/wordpress/free-window-treatment-consultation.html \
    --status draft
"""

from __future__ import annotations

import argparse
import base64
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from typing import Any


def request(base_url: str, path: str, method: str, payload: dict[str, Any] | None) -> Any:
    user = os.environ.get("WP_USER")
    password = os.environ.get("WP_APP_PASSWORD")
    if not user or not password:
        raise SystemExit("Set WP_USER and WP_APP_PASSWORD first.")

    url = urllib.parse.urljoin(base_url.rstrip("/") + "/", path.lstrip("/"))
    body = None
    headers = {"Accept": "application/json"}
    if payload is not None:
        body = json.dumps(payload).encode("utf-8")
        headers["Content-Type"] = "application/json"
    token = base64.b64encode(f"{user}:{password}".encode("utf-8")).decode("ascii")
    headers["Authorization"] = f"Basic {token}"

    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=30) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise SystemExit(f"WordPress API error {exc.code}: {detail}") from exc


def find_page_by_slug(base_url: str, slug: str) -> dict[str, Any] | None:
    query = urllib.parse.urlencode({"slug": slug, "per_page": 1})
    data = request(base_url, f"/wp-json/wp/v2/pages?{query}", "GET", None)
    if isinstance(data, list) and data:
        return data[0]
    return None


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--slug", required=True)
    parser.add_argument("--title", required=True)
    parser.add_argument("--content-file", required=True)
    parser.add_argument("--status", default="draft", choices=["draft", "publish", "private"])
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    base_url = os.environ.get("WP_BASE_URL", "https://www.805shutters.com")
    with open(args.content_file, "r", encoding="utf-8") as handle:
        content = handle.read()

    payload = {
        "slug": args.slug,
        "title": args.title,
        "content": content,
        "status": args.status,
    }

    if args.dry_run:
        action = "create_or_update"
        print(json.dumps({"action": action, "payload": payload}, indent=2))
        return 0

    existing = find_page_by_slug(base_url, args.slug)
    if existing:
        result = request(base_url, f"/wp-json/wp/v2/pages/{existing['id']}", "POST", payload)
        print(f"Updated page {result.get('id')}: {result.get('link')}")
    else:
        result = request(base_url, "/wp-json/wp/v2/pages", "POST", payload)
        print(f"Created page {result.get('id')}: {result.get('link')}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
