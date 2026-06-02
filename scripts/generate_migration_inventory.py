#!/usr/bin/env python3
"""Generate migration inventory CSVs from the live-site audit report."""

from __future__ import annotations

import csv
import json
from pathlib import Path
from urllib.parse import urlparse


ROOT = Path(__file__).resolve().parents[1]
REPORT_PATH = ROOT / "reports" / "site-audit.json"
MIGRATION_DIR = ROOT / "migration"
INVENTORY_PATH = MIGRATION_DIR / "current-url-inventory.csv"
REDIRECTS_PATH = MIGRATION_DIR / "redirects-draft.csv"


def path_for(url: str) -> str:
    path = urlparse(url).path or "/"
    if path != "/" and not path.endswith("/"):
        return f"{path}/"
    return path


def redirect_target_for(path: str) -> str:
    lowered = path.lower()
    if "blind" in lowered:
        return "/blinds/"
    if "shade" in lowered:
        return "/shades/"
    if "shutter" in lowered:
        return "/shutters/"
    return "/gallery/"


def main() -> int:
    report = json.loads(REPORT_PATH.read_text(encoding="utf-8"))
    MIGRATION_DIR.mkdir(exist_ok=True)

    with INVENTORY_PATH.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(
            handle,
            fieldnames=[
                "path",
                "title",
                "status",
                "robots",
                "word_count",
                "h1_count",
                "missing_alt_count",
                "vague_link_count",
                "flags",
                "migration_status",
                "recommended_target",
            ],
        )
        writer.writeheader()
        for page in report["pages"]:
            path = path_for(page["url"])
            flags = ",".join(page.get("issue_flags", []))
            writer.writerow(
                {
                    "path": path,
                    "title": page.get("title", ""),
                    "status": page.get("status", ""),
                    "robots": page.get("robots", ""),
                    "word_count": page.get("word_count", ""),
                    "h1_count": len(page.get("h1", [])),
                    "missing_alt_count": page.get("missing_alt_count", ""),
                    "vague_link_count": page.get("vague_link_count", ""),
                    "flags": flags,
                    "migration_status": "needs_review",
                    "recommended_target": path,
                }
            )

    with REDIRECTS_PATH.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(
            handle,
            fieldnames=["source", "destination", "permanent", "reason"],
        )
        writer.writeheader()
        for post in report.get("wordpress", {}).get("posts", []):
            source = path_for(post.get("link", ""))
            if not source:
                continue
            writer.writerow(
                {
                    "source": source,
                    "destination": redirect_target_for(source),
                    "permanent": "false",
                    "reason": "sampled public noindex WordPress media/post URL",
                }
            )

    print(f"Wrote {INVENTORY_PATH.relative_to(ROOT)}")
    print(f"Wrote {REDIRECTS_PATH.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
