#!/usr/bin/env python3
"""Create a compact SEO scorecard from crawl, parity, and Lighthouse reports."""

from __future__ import annotations

import argparse
import json
import sys
import time
from collections import Counter
from pathlib import Path
from typing import Any


PRIORITY_PATHS = [
    "/",
    "/free-window-treatment-consultation/",
    "/book-consultation/",
    "/shutters/",
    "/shades/",
    "/blinds/",
    "/window-treatments/",
    "/window-coverings/",
    "/commercial-window-coverings/",
    "/commercial-roller-shades/",
    "/shutters/camarillo/",
    "/shutters/thousand-oaks/",
    "/shutters/ventura/",
    "/shutters/oxnard/",
    "/shades/camarillo-ca/",
    "/blinds/camarillo-ca/",
    "/blinds/ventura-county/",
    "/recent-projects/",
    "/reviews/",
    "/contact/",
]

LOWER_IS_BETTER = {
    "indexable_flagged_pages",
    "indexable_issue_total",
    "indexable_pages_with_missing_alt",
    "indexable_pages_with_vague_links",
    "indexable_pages_with_http_assets",
    "missing_title",
    "missing_description",
    "missing_canonical",
    "h1_count",
    "vague_links",
    "http_assets",
    "missing_alt",
    "thin_indexable_content",
}


def load_json(path: str | None) -> Any:
    if not path:
        return None
    report_path = Path(path)
    if not report_path.exists():
        return None
    with report_path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def normalize_path_from_url(url: str) -> str:
    from urllib.parse import urlparse

    path = urlparse(url).path or "/"
    if path == "/":
        return "/"
    return f"/{path.strip('/')}/"


def is_noindex(page: dict[str, Any]) -> bool:
    return "noindex" in str(page.get("robots", "")).lower()


def indexable_pages(audit: dict[str, Any]) -> list[dict[str, Any]]:
    return [page for page in audit.get("pages", []) if not is_noindex(page)]


def issue_counts(pages: list[dict[str, Any]]) -> Counter[str]:
    counts: Counter[str] = Counter()
    for page in pages:
        for flag in page.get("issue_flags", []):
            counts[str(flag)] += 1
    return counts


def page_by_path(audit: dict[str, Any]) -> dict[str, dict[str, Any]]:
    return {
        normalize_path_from_url(str(page.get("url", ""))): page
        for page in audit.get("pages", [])
        if page.get("url")
    }


def summarize_audit(audit: dict[str, Any] | None) -> dict[str, Any] | None:
    if not audit:
        return None
    pages = indexable_pages(audit)
    counts = issue_counts(pages)
    flagged_pages = [page for page in pages if page.get("issue_flags")]
    return {
        "generated_at": audit.get("generated_at"),
        "base_url": audit.get("base_url"),
        "sitemap_urls": audit.get("summary", {}).get("sitemap_urls", len(audit.get("pages", []))),
        "indexable_pages": len(pages),
        "indexable_flagged_pages": len(flagged_pages),
        "indexable_issue_total": sum(counts.values()),
        "issue_counts": dict(sorted(counts.items())),
        "summary": audit.get("summary", {}),
    }


def priority_page_rows(audit: dict[str, Any] | None) -> list[dict[str, Any]]:
    if not audit:
        return []
    lookup = page_by_path(audit)
    rows = []
    for path in PRIORITY_PATHS:
        page = lookup.get(path)
        if not page:
            rows.append(
                {
                    "path": path,
                    "status": "missing",
                    "word_count": 0,
                    "h1_count": 0,
                    "flags": ["missing_from_audit"],
                }
            )
            continue
        rows.append(
            {
                "path": path,
                "status": page.get("status"),
                "word_count": page.get("word_count", 0),
                "h1_count": len(page.get("h1", [])),
                "flags": page.get("issue_flags", []),
            }
        )
    return rows


def flatten_metrics(summary: dict[str, Any] | None) -> dict[str, int]:
    if not summary:
        return {}
    metrics = {
        "sitemap_urls": int(summary.get("sitemap_urls") or 0),
        "indexable_pages": int(summary.get("indexable_pages") or 0),
        "indexable_flagged_pages": int(summary.get("indexable_flagged_pages") or 0),
        "indexable_issue_total": int(summary.get("indexable_issue_total") or 0),
    }
    raw_summary = summary.get("summary", {})
    for key in (
        "indexable_pages_with_missing_alt",
        "indexable_pages_with_vague_links",
        "indexable_pages_with_http_assets",
    ):
        if key in raw_summary:
            metrics[key] = int(raw_summary.get(key) or 0)
    for key, value in summary.get("issue_counts", {}).items():
        metrics[key] = int(value or 0)
    return metrics


def metric_comparison(current: dict[str, Any] | None, previous: dict[str, Any] | None) -> list[dict[str, Any]]:
    current_metrics = flatten_metrics(current)
    previous_metrics = flatten_metrics(previous)
    keys = sorted(set(current_metrics) | set(previous_metrics))
    rows = []
    for key in keys:
        current_value = current_metrics.get(key, 0)
        previous_value = previous_metrics.get(key)
        delta = None if previous_value is None else current_value - previous_value
        if delta is None:
            status = "baseline"
        elif delta == 0:
            status = "flat"
        elif key in LOWER_IS_BETTER:
            status = "better" if delta < 0 else "worse"
        else:
            status = "up" if delta > 0 else "down"
        rows.append(
            {
                "metric": key,
                "previous": previous_value,
                "current": current_value,
                "delta": delta,
                "status": status,
            }
        )
    return rows


def lighthouse_score(report: dict[str, Any] | None, category: str) -> int | None:
    if not report:
        return None
    score = report.get("categories", {}).get(category, {}).get("score")
    if score is None:
        return None
    return round(float(score) * 100)


def summarize_lighthouse(mobile: dict[str, Any] | None, desktop: dict[str, Any] | None) -> dict[str, Any]:
    categories = ("performance", "accessibility", "best-practices", "seo")
    return {
        "mobile": {category: lighthouse_score(mobile, category) for category in categories},
        "desktop": {category: lighthouse_score(desktop, category) for category in categories},
    }


def summarize_parity(parity: dict[str, Any] | None) -> dict[str, Any] | None:
    if not parity:
        return None
    summary = parity.get("summary", {})
    return {
        "generated_at": parity.get("generated_at"),
        "live_base": parity.get("live_base"),
        "candidate_base": parity.get("candidate_base"),
        "live_sitemap_paths": summary.get("live_sitemap_paths"),
        "candidate_sitemap_paths": summary.get("candidate_sitemap_paths"),
        "missing_candidate_paths": summary.get("missing_candidate_paths"),
        "extra_candidate_paths": summary.get("extra_candidate_paths"),
        "blocking_flagged_pages": summary.get("blocking_flagged_pages"),
    }


def verdict(current: dict[str, Any] | None, previous: dict[str, Any] | None, parity: dict[str, Any] | None) -> str:
    if not current:
        return "No crawl audit loaded"
    if parity and (parity.get("blocking_flagged_pages") or 0) > 0:
        return "Needs attention: parity audit has blocking flags"
    if not previous:
        return "Baseline captured"
    rows = metric_comparison(current, previous)
    better = sum(1 for row in rows if row["status"] == "better")
    worse = sum(1 for row in rows if row["status"] == "worse")
    current_issues = int(current.get("indexable_issue_total") or 0)
    if current_issues == 0 and worse == 0:
        return "Improving: crawl issue count is clean"
    if better > worse:
        return "Improving: more crawl metrics improved than regressed"
    if worse > better:
        return "Needs attention: more crawl metrics regressed than improved"
    return "Flat: watch next crawl and analytics sample"


def render_table(headers: list[str], rows: list[list[Any]]) -> list[str]:
    lines = [
        "| " + " | ".join(headers) + " |",
        "| " + " | ".join("---" for _ in headers) + " |",
    ]
    for row in rows:
        lines.append("| " + " | ".join(str(value) for value in row) + " |")
    return lines


def render_markdown(scorecard: dict[str, Any]) -> str:
    lines = [
        "# 805 Shutters SEO scorecard",
        "",
        f"Generated: {scorecard['generated_at']}",
        f"Current snapshot: {scorecard['current_label']}",
        f"Verdict: {scorecard['verdict']}",
        "",
        "## Crawl Trend",
        "",
    ]
    comparison_rows = [
        [
            row["metric"],
            "" if row["previous"] is None else row["previous"],
            row["current"],
            "" if row["delta"] is None else f"{row['delta']:+d}",
            row["status"],
        ]
        for row in scorecard["metric_comparison"]
    ]
    lines.extend(render_table(["Metric", "Previous", "Current", "Delta", "Status"], comparison_rows))

    current = scorecard.get("current_audit") or {}
    lines.extend(
        [
            "",
            "## Current Crawl Health",
            "",
            f"- Audit generated: {current.get('generated_at') or 'unknown'}",
            f"- Base URL: {current.get('base_url') or 'unknown'}",
            f"- Sitemap URLs: {current.get('sitemap_urls', 0)}",
            f"- Indexable flagged pages: {current.get('indexable_flagged_pages', 0)}",
            f"- Indexable issue total: {current.get('indexable_issue_total', 0)}",
            "",
            "## Priority Money Pages",
            "",
        ]
    )
    priority_rows = [
        [
            row["path"],
            row["status"],
            row["word_count"],
            row["h1_count"],
            ", ".join(row["flags"]) if row["flags"] else "clean",
        ]
        for row in scorecard["priority_pages"]
    ]
    lines.extend(render_table(["Path", "Status", "Words", "H1s", "Flags"], priority_rows))

    parity = scorecard.get("parity")
    lines.extend(["", "## Launch Parity", ""])
    if parity:
        lines.extend(
            [
                f"- Parity generated: {parity.get('generated_at')}",
                f"- Live sitemap paths: {parity.get('live_sitemap_paths')}",
                f"- Candidate sitemap paths: {parity.get('candidate_sitemap_paths')}",
                f"- Missing candidate paths: {parity.get('missing_candidate_paths')}",
                f"- Extra candidate paths: {parity.get('extra_candidate_paths')}",
                f"- Blocking flagged pages: {parity.get('blocking_flagged_pages')}",
            ]
        )
    else:
        lines.append("- No parity report loaded.")

    lines.extend(["", "## Lighthouse Snapshot", ""])
    lighthouse = scorecard.get("lighthouse", {})
    lines.extend(
        render_table(
            ["Surface", "Performance", "Accessibility", "Best Practices", "SEO"],
            [
                [
                    "Mobile",
                    lighthouse.get("mobile", {}).get("performance"),
                    lighthouse.get("mobile", {}).get("accessibility"),
                    lighthouse.get("mobile", {}).get("best-practices"),
                    lighthouse.get("mobile", {}).get("seo"),
                ],
                [
                    "Desktop",
                    lighthouse.get("desktop", {}).get("performance"),
                    lighthouse.get("desktop", {}).get("accessibility"),
                    lighthouse.get("desktop", {}).get("best-practices"),
                    lighthouse.get("desktop", {}).get("seo"),
                ],
            ],
        )
    )

    lines.extend(
        [
            "",
            "## External Dashboard Checks",
            "",
            "- Search Console: compare clicks, impressions, CTR, average position, indexed pages, and crawl errors for the last 7 days vs the prior 7 days.",
            "- GA4: compare organic sessions, paid-social sessions with UTMs, `generate_lead`, `phone_click`, and landing-page conversion rate.",
            "- Meta Events Manager: confirm one active Pixel, browser Lead, server Lead deduplication by event ID, and Contact events on phone clicks.",
            "- CRM/leads: compare lead count and lead quality by city, product interest, page path, and UTM source.",
            "",
        ]
    )
    return "\n".join(lines)


def build_scorecard(args: argparse.Namespace) -> dict[str, Any]:
    current_audit = summarize_audit(load_json(args.audit))
    previous_audit = summarize_audit(load_json(args.previous_audit))
    parity = summarize_parity(load_json(args.parity))
    lighthouse = summarize_lighthouse(load_json(args.lighthouse_mobile), load_json(args.lighthouse_desktop))
    scorecard = {
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "current_label": args.current_label,
        "verdict": verdict(current_audit, previous_audit, parity),
        "current_audit": current_audit,
        "previous_audit": previous_audit,
        "metric_comparison": metric_comparison(current_audit, previous_audit),
        "priority_pages": priority_page_rows(load_json(args.audit)),
        "parity": parity,
        "lighthouse": lighthouse,
    }
    return scorecard


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--audit", default="reports/site-audit.json")
    parser.add_argument("--previous-audit")
    parser.add_argument("--parity", default="reports/seo-parity-audit.json")
    parser.add_argument("--current-label", default="Latest crawl snapshot")
    parser.add_argument("--lighthouse-mobile", default="reports/lighthouse-home-mobile.json")
    parser.add_argument("--lighthouse-desktop", default="reports/lighthouse-home-desktop.json")
    parser.add_argument("--output", default="reports/seo-scorecard.md")
    parser.add_argument("--json", default="reports/seo-scorecard.json")
    args = parser.parse_args()

    scorecard = build_scorecard(args)
    Path(args.output).parent.mkdir(parents=True, exist_ok=True)
    Path(args.json).parent.mkdir(parents=True, exist_ok=True)
    Path(args.output).write_text(render_markdown(scorecard), encoding="utf-8")
    with Path(args.json).open("w", encoding="utf-8") as handle:
        json.dump(scorecard, handle, indent=2, sort_keys=True)
        handle.write("\n")
    print(f"Wrote {args.output}")
    print(f"Wrote {args.json}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
