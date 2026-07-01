#!/usr/bin/env python3
"""Submit updated 805 Shutters URLs to IndexNow."""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urljoin, urlparse
from urllib.request import Request, urlopen


INDEXNOW_KEY = "3a1bd45f8d764f2ea8cf60d51a2c9e76"
INDEXNOW_KEY_FILE = f"{INDEXNOW_KEY}.txt"
DEFAULT_ENDPOINT = "https://api.indexnow.org/indexnow"
DEFAULT_BASE_URL = "https://www.805shutters.com"

DEFAULT_URL_PATHS = [
    "/llms.txt",
    "/ai-search-feed.json",
    "/answers.json",
    "/window-treatment-comparison-guide/",
    "/best-window-treatments-ventura-county/",
    "/plantation-shutters-vs-shades-ventura-county/",
    "/custom-blinds-shades-shutters-camarillo/",
    "/commercial-roller-shades-ventura-county/",
    "/sliding-door-window-treatments-ventura-county/",
    "/motorized-window-shades-ventura-county/",
    "/book-consultation/",
    "/free-window-treatment-consultation/",
    "/commercial-window-coverings/",
]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Submit updated canonical URLs to IndexNow.",
    )
    parser.add_argument(
        "--base-url",
        default=DEFAULT_BASE_URL,
        help=f"Canonical site origin to submit. Defaults to {DEFAULT_BASE_URL}.",
    )
    parser.add_argument(
        "--endpoint",
        default=DEFAULT_ENDPOINT,
        help=f"IndexNow endpoint. Defaults to {DEFAULT_ENDPOINT}.",
    )
    parser.add_argument(
        "--url",
        action="append",
        default=[],
        help="URL or site-relative path to submit. May be repeated.",
    )
    parser.add_argument(
        "--from-file",
        type=Path,
        help="Optional newline-delimited list of URLs or site-relative paths.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print the request payload without posting to IndexNow.",
    )
    parser.add_argument(
        "--output",
        type=Path,
        help="Optional JSON file for the request/response summary.",
    )
    return parser.parse_args()


def verify_local_key_file() -> None:
    key_path = Path("public") / INDEXNOW_KEY_FILE
    if not key_path.exists():
        raise SystemExit(f"Missing IndexNow key file: {key_path}")

    actual = key_path.read_text(encoding="utf-8").strip()
    if actual != INDEXNOW_KEY:
        raise SystemExit(f"IndexNow key file does not match expected key: {key_path}")


def normalize_base_url(base_url: str) -> str:
    parsed = urlparse(base_url)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise SystemExit(f"Invalid --base-url: {base_url}")
    return f"{parsed.scheme}://{parsed.netloc}"


def read_file_entries(path: Path | None) -> list[str]:
    if path is None:
        return []
    entries: list[str] = []
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if line and not line.startswith("#"):
            entries.append(line)
    return entries


def normalize_url(base_url: str, value: str) -> str:
    parsed = urlparse(value)
    if parsed.scheme and parsed.netloc:
        return value
    if not value.startswith("/"):
        value = f"/{value}"
    return urljoin(f"{base_url}/", value.lstrip("/"))


def build_payload(base_url: str, entries: list[str]) -> dict[str, object]:
    urls = [normalize_url(base_url, entry) for entry in entries]
    deduped_urls = list(dict.fromkeys(urls))
    host = urlparse(base_url).netloc
    return {
        "host": host,
        "key": INDEXNOW_KEY,
        "keyLocation": urljoin(f"{base_url}/", INDEXNOW_KEY_FILE),
        "urlList": deduped_urls,
    }


def submit_payload(endpoint: str, payload: dict[str, object]) -> tuple[int, str]:
    data = json.dumps(payload, indent=None, separators=(",", ":")).encode("utf-8")
    request = Request(
        endpoint,
        data=data,
        method="POST",
        headers={
            "Content-Type": "application/json; charset=utf-8",
            "User-Agent": "805Shutters-IndexNowSubmitter/1.0 (+https://www.805shutters.com/)",
        },
    )
    try:
        with urlopen(request, timeout=30) as response:
            body = response.read().decode("utf-8", "replace")
            return int(response.status), body
    except HTTPError as exc:
        body = exc.read().decode("utf-8", "replace")
        return int(exc.code), body
    except URLError as exc:
        raise SystemExit(f"IndexNow request failed: {exc}") from exc


def write_summary(path: Path | None, summary: dict[str, object]) -> None:
    if path is None:
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(summary, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def main() -> int:
    args = parse_args()
    verify_local_key_file()

    base_url = normalize_base_url(args.base_url)
    entries = list(args.url) if args.url else list(DEFAULT_URL_PATHS)
    entries.extend(read_file_entries(args.from_file))
    payload = build_payload(base_url, entries)

    summary: dict[str, object] = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "endpoint": args.endpoint,
        "dry_run": args.dry_run,
        "payload": payload,
    }

    if args.dry_run:
        write_summary(args.output, summary)
        print(json.dumps(summary, indent=2, sort_keys=True))
        return 0

    status, body = submit_payload(args.endpoint, payload)
    summary["status"] = status
    summary["body"] = body
    write_summary(args.output, summary)

    print(f"IndexNow response: HTTP {status}")
    if body:
        print(body)

    return 0 if status in {200, 202} else 1


if __name__ == "__main__":
    sys.exit(main())
