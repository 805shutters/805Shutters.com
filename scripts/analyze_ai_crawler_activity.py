#!/usr/bin/env python3
"""Analyze AI crawler and LLM referral activity from exported logs."""

from __future__ import annotations

import argparse
import csv
import glob
import json
import re
import sys
from collections import Counter
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable
from urllib.parse import urlparse


DEFAULT_INPUT_GLOBS = [
    "reports/*ai*crawler*log*.json",
    "reports/*ai*crawler*log*.jsonl",
    "reports/*ai*crawler*log*.ndjson",
    "reports/*ai*crawler*log*.log",
    "reports/ai-crawler-input*.json",
    "reports/ai-crawler-input*.jsonl",
    "reports/ai-crawler-input*.ndjson",
    "reports/ai-crawler-input*.log",
    "reports/ai-crawler-source*.json",
    "reports/ai-crawler-source*.jsonl",
    "reports/ai-crawler-source*.ndjson",
    "reports/ai-crawler-source*.log",
    "reports/*vercel*log*.json",
    "reports/*vercel*log*.jsonl",
    "reports/*vercel*log*.ndjson",
    "reports/*vercel*log*.log",
    "reports/logs/*.json",
    "reports/logs/*.jsonl",
    "reports/logs/*.ndjson",
    "reports/logs/*.log",
]

PRIORITY_PATHS = [
    "/llms.txt",
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

AI_BOT_PATTERNS = [
    ("OpenAI", "OAI-SearchBot", re.compile(r"\bOAI-SearchBot\b", re.I)),
    ("OpenAI", "ChatGPT-User", re.compile(r"\bChatGPT-User\b", re.I)),
    ("OpenAI", "GPTBot", re.compile(r"\bGPTBot\b", re.I)),
    ("Perplexity", "PerplexityBot", re.compile(r"\bPerplexityBot\b", re.I)),
    ("Perplexity", "Perplexity-User", re.compile(r"\bPerplexity-User\b", re.I)),
    ("Anthropic", "ClaudeBot", re.compile(r"\bClaudeBot\b", re.I)),
    ("Anthropic", "Claude-SearchBot", re.compile(r"\bClaude-SearchBot\b", re.I)),
    ("Anthropic", "Claude-User", re.compile(r"\bClaude-User\b", re.I)),
    ("Google", "Google-Extended", re.compile(r"\bGoogle-Extended\b", re.I)),
    ("Google", "Googlebot", re.compile(r"\bGooglebot\b", re.I)),
    ("Microsoft", "Bingbot", re.compile(r"\bBingbot\b", re.I)),
    ("Common Crawl", "CCBot", re.compile(r"\bCCBot\b", re.I)),
    ("Apple", "Applebot", re.compile(r"\bApplebot\b", re.I)),
    ("Meta", "FacebookBot", re.compile(r"\bFacebookBot\b", re.I)),
]

AI_REFERRER_PATTERNS = [
    ("OpenAI", "ChatGPT", re.compile(r"(^|\.)chatgpt\.com$|(^|\.)chat\.openai\.com$", re.I)),
    ("Perplexity", "Perplexity", re.compile(r"(^|\.)perplexity\.ai$", re.I)),
    ("Anthropic", "Claude", re.compile(r"(^|\.)claude\.ai$", re.I)),
    ("Google", "Gemini", re.compile(r"(^|\.)gemini\.google\.com$", re.I)),
    ("Microsoft", "Copilot", re.compile(r"(^|\.)copilot\.microsoft\.com$|(^|\.)bing\.com$", re.I)),
    ("You.com", "You.com", re.compile(r"(^|\.)you\.com$", re.I)),
    ("Phind", "Phind", re.compile(r"(^|\.)phind\.com$", re.I)),
]

REQUEST_LINE_RE = re.compile(r"\b(?:GET|POST|HEAD|PUT|PATCH|DELETE|OPTIONS)\s+(\S+)")
URL_RE = re.compile(r"https?://[^\s\"']+")
PATH_RE = re.compile(r"(?P<path>/[A-Za-z0-9._~!$&'()*+,;=:@%/-]*)(?:[?#][^\s\"']*)?")
USER_AGENT_RE = re.compile(r"(?:user-agent|ua)[=:]\s*[\"']?([^\"'\n]+)", re.I)
STATUS_RE = re.compile(r"\bstatus(?:Code)?[=:]\s*(\d{3})\b", re.I)


@dataclass
class ActivityEvent:
    source: str
    timestamp: str
    path: str
    url: str
    user_agent: str
    referrer: str
    status: str
    family: str
    label: str
    signal_type: str


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--input",
        action="append",
        default=[],
        help="Log file, CSV export, JSON/NDJSON drain export, or '-' for stdin. May be repeated.",
    )
    parser.add_argument(
        "--output",
        default="reports/ai-crawler-activity.md",
        help="Markdown report path.",
    )
    parser.add_argument(
        "--json",
        default="reports/ai-crawler-activity.json",
        help="JSON report path.",
    )
    parser.add_argument(
        "--priority-path",
        action="append",
        default=[],
        help="Additional path to report as an LLM citation surface.",
    )
    return parser.parse_args()


def nested_get(payload: dict[str, Any], *keys: str) -> Any:
    value: Any = payload
    for key in keys:
        if not isinstance(value, dict):
            return None
        value = value.get(key)
    return value


def first_value(payload: dict[str, Any], paths: Iterable[tuple[str, ...]]) -> str:
    for path in paths:
        value = nested_get(payload, *path)
        if value is not None:
            return str(value)
    return ""


def normalize_path(value: str) -> str:
    if not value:
        return ""
    parsed = urlparse(value)
    if parsed.scheme and parsed.netloc:
        return parsed.path or "/"
    if value.startswith("/"):
        return value.split("?", 1)[0].split("#", 1)[0] or "/"
    return ""


def referrer_host(referrer: str) -> str:
    if not referrer:
        return ""
    parsed = urlparse(referrer if "://" in referrer else f"https://{referrer}")
    return parsed.netloc.lower()


def classify_user_agent(user_agent: str) -> tuple[str, str]:
    for family, label, pattern in AI_BOT_PATTERNS:
        if pattern.search(user_agent):
            return family, label
    return "", ""


def classify_referrer(referrer: str) -> tuple[str, str]:
    host = referrer_host(referrer)
    for family, label, pattern in AI_REFERRER_PATTERNS:
        if pattern.search(host):
            return family, label
    return "", ""


def extract_from_json(payload: dict[str, Any], source: str) -> ActivityEvent | None:
    text = json.dumps(payload, sort_keys=True)
    user_agent = first_value(
        payload,
        [
            ("userAgent",),
            ("user_agent",),
            ("requestUserAgent",),
            ("user-agent",),
            ("headers", "user-agent"),
            ("headers", "User-Agent"),
            ("request", "headers", "user-agent"),
            ("request", "headers", "User-Agent"),
            ("request", "userAgent"),
            ("device", "userAgent"),
        ],
    )
    referrer = first_value(
        payload,
        [
            ("referrer",),
            ("referer",),
            ("headers", "referer"),
            ("headers", "referrer"),
            ("request", "headers", "referer"),
            ("request", "headers", "referrer"),
        ],
    )
    url = first_value(
        payload,
        [
            ("url",),
            ("path",),
            ("requestPath",),
            ("requestUrl",),
            ("request", "url"),
            ("request", "path"),
            ("proxy", "path"),
        ],
    )
    timestamp = first_value(
        payload,
        [
            ("timestamp",),
            ("time",),
            ("datetime",),
            ("date",),
            ("createdAt",),
        ],
    )
    status = first_value(
        payload,
        [
            ("status",),
            ("statusCode",),
            ("response", "status"),
            ("response", "statusCode"),
        ],
    )

    if not user_agent:
        match = USER_AGENT_RE.search(text)
        user_agent = match.group(1).strip() if match else ""
    if not url:
        url_match = URL_RE.search(text)
        if url_match:
            url = url_match.group(0)
        else:
            request_match = REQUEST_LINE_RE.search(text)
            url = request_match.group(1) if request_match else ""

    return build_event(
        source=source,
        timestamp=timestamp,
        url=url,
        user_agent=user_agent,
        referrer=referrer,
        status=status,
        raw_text=text,
    )


def extract_from_text(line: str, source: str) -> ActivityEvent | None:
    user_agent_match = USER_AGENT_RE.search(line)
    user_agent = user_agent_match.group(1).strip() if user_agent_match else ""

    request_match = REQUEST_LINE_RE.search(line)
    url = request_match.group(1) if request_match else ""
    if not url:
        url_match = URL_RE.search(line)
        url = url_match.group(0) if url_match else ""
    if not url:
        path_match = PATH_RE.search(line)
        url = path_match.group("path") if path_match else ""

    status_match = STATUS_RE.search(line)
    status = status_match.group(1) if status_match else ""

    return build_event(
        source=source,
        timestamp="",
        url=url,
        user_agent=user_agent,
        referrer="",
        status=status,
        raw_text=line,
    )


def build_event(
    source: str,
    timestamp: str,
    url: str,
    user_agent: str,
    referrer: str,
    status: str,
    raw_text: str,
) -> ActivityEvent | None:
    bot_family, bot_label = classify_user_agent(user_agent)
    ref_family, ref_label = classify_referrer(referrer)

    family = bot_family or ref_family
    label = bot_label or ref_label
    signal_type = "crawler" if bot_label else "referrer" if ref_label else ""

    if not signal_type:
        return None

    path = normalize_path(url)
    if not path:
        path_match = PATH_RE.search(raw_text)
        path = normalize_path(path_match.group("path")) if path_match else ""

    return ActivityEvent(
        source=source,
        timestamp=str(timestamp or ""),
        path=path or "(unknown)",
        url=str(url or ""),
        user_agent=user_agent,
        referrer=referrer,
        status=str(status or ""),
        family=family,
        label=label,
        signal_type=signal_type,
    )


def read_records_from_csv(text: str, source: str) -> list[ActivityEvent]:
    events: list[ActivityEvent] = []
    reader = csv.DictReader(text.splitlines())
    if not reader.fieldnames:
        return events
    for row in reader:
        event = extract_from_json(dict(row), source)
        if event:
            events.append(event)
    return events


def read_records(text: str, source: str) -> list[ActivityEvent]:
    events: list[ActivityEvent] = []
    stripped = text.strip()
    if not stripped:
        return events

    if "," in stripped.splitlines()[0] and any(key in stripped.splitlines()[0].lower() for key in ["url", "path", "agent", "referrer", "referer"]):
        events.extend(read_records_from_csv(text, source))
        if events:
            return events

    try:
        payload = json.loads(stripped)
    except json.JSONDecodeError:
        payload = None

    if isinstance(payload, list):
        for item in payload:
            if isinstance(item, dict):
                event = extract_from_json(item, source)
                if event:
                    events.append(event)
        return events

    if isinstance(payload, dict):
        event = extract_from_json(payload, source)
        if event:
            events.append(event)
        for key in ["events", "logs", "data"]:
            nested = payload.get(key)
            if isinstance(nested, list):
                for item in nested:
                    if isinstance(item, dict):
                        nested_event = extract_from_json(item, source)
                        if nested_event:
                            events.append(nested_event)
        return events

    for line in text.splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            payload = json.loads(line)
        except json.JSONDecodeError:
            event = extract_from_text(line, source)
        else:
            event = extract_from_json(payload, source) if isinstance(payload, dict) else None
        if event:
            events.append(event)

    return events


def expand_inputs(inputs: list[str]) -> list[str]:
    if inputs:
        return inputs

    matches: list[str] = []
    for pattern in DEFAULT_INPUT_GLOBS:
        matches.extend(glob.glob(pattern))
    return sorted(set(matches))


def read_all_events(inputs: list[str]) -> tuple[list[ActivityEvent], list[str]]:
    sources = expand_inputs(inputs)
    events: list[ActivityEvent] = []

    if not sources:
        return events, []

    for source in sources:
        if source == "-":
            text = sys.stdin.read()
        else:
            path = Path(source)
            if not path.exists():
                print(f"Skipping missing input: {source}", file=sys.stderr)
                continue
            text = path.read_text(encoding="utf-8", errors="replace")
        events.extend(read_records(text, source))

    return events, sources


def markdown_table(headers: Iterable[str], rows: Iterable[Iterable[object]]) -> list[str]:
    header_list = list(headers)
    lines = [
        "| " + " | ".join(header_list) + " |",
        "| " + " | ".join("---" for _ in header_list) + " |",
    ]
    for row in rows:
        lines.append("| " + " | ".join(str(item) for item in row) + " |")
    return lines


def build_payload(events: list[ActivityEvent], sources: list[str], priority_paths: list[str]) -> dict[str, Any]:
    crawler_events = [event for event in events if event.signal_type == "crawler"]
    referrer_events = [event for event in events if event.signal_type == "referrer"]
    by_family = Counter(event.family for event in events)
    by_label = Counter(event.label for event in events)
    by_path = Counter(event.path for event in events)
    by_priority_path = {path: by_path.get(path, 0) for path in priority_paths}
    missing_priority_hits = [path for path, count in by_priority_path.items() if count == 0]

    status_counts = Counter(event.status or "(unknown)" for event in events)
    referrer_counts = Counter(referrer_host(event.referrer) or "(none)" for event in referrer_events)

    return {
        "generated_at": datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        "sources": sources,
        "source_count": len(sources),
        "event_count": len(events),
        "crawler_event_count": len(crawler_events),
        "referrer_event_count": len(referrer_events),
        "verdict": "No source logs found" if not sources else "No AI crawler or LLM referrer events found" if not events else "AI crawler/referrer activity detected",
        "by_family": dict(by_family.most_common()),
        "by_label": dict(by_label.most_common()),
        "by_path": dict(by_path.most_common()),
        "by_priority_path": by_priority_path,
        "missing_priority_hits": missing_priority_hits,
        "status_counts": dict(status_counts.most_common()),
        "referrers": dict(referrer_counts.most_common()),
        "recent_events": [asdict(event) for event in events[-25:]],
    }


def build_report(payload: dict[str, Any]) -> str:
    lines = [
        "# 805 Shutters AI crawler activity",
        "",
        f"Generated: {payload['generated_at']}",
        f"Verdict: {payload['verdict']}",
        f"Sources read: {payload['source_count']}",
        f"AI crawler/referrer events: {payload['event_count']}",
        f"Crawler events: {payload['crawler_event_count']}",
        f"LLM referrer events: {payload['referrer_event_count']}",
        "",
        "## Sources",
        "",
    ]

    if payload["sources"]:
        lines.extend(f"- {source}" for source in payload["sources"])
    else:
        lines.extend(
            [
                "- No local log exports were found.",
                "- Export Vercel logs, drain NDJSON, access logs, or analytics CSV into `reports/` and rerun `npm run audit:ai-crawlers`.",
                "- You can also pass files directly with `python3 scripts/analyze_ai_crawler_activity.py --input path/to/log.ndjson`.",
            ]
        )

    lines.extend(
        [
            "",
            "## Bot Families",
            "",
            *markdown_table(["Family", "Events"], payload["by_family"].items() or []),
            "",
            "## Bot Labels",
            "",
            *markdown_table(["Crawler or referrer", "Events"], payload["by_label"].items() or []),
            "",
            "## Priority URL Coverage",
            "",
            *markdown_table(["Path", "Events"], payload["by_priority_path"].items()),
            "",
            "## Top Paths",
            "",
            *markdown_table(["Path", "Events"], list(payload["by_path"].items())[:20]),
            "",
            "## Referrers",
            "",
            *markdown_table(["Host", "Events"], payload["referrers"].items() or []),
            "",
            "## Recent Events",
            "",
            *markdown_table(
                ["Signal", "Family", "Label", "Path", "Status"],
                [
                    [
                        event["signal_type"],
                        event["family"],
                        event["label"],
                        event["path"],
                        event["status"] or "(unknown)",
                    ]
                    for event in payload["recent_events"][-10:]
                ],
            ),
        ]
    )

    return "\n".join(lines) + "\n"


def write_json(path: str, payload: dict[str, Any]) -> None:
    output = Path(path)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def write_markdown(path: str, report: str) -> None:
    output = Path(path)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(report, encoding="utf-8")


def main() -> int:
    args = parse_args()
    priority_paths = list(dict.fromkeys([*PRIORITY_PATHS, *args.priority_path]))
    events, sources = read_all_events(args.input)
    payload = build_payload(events, sources, priority_paths)
    write_json(args.json, payload)
    write_markdown(args.output, build_report(payload))
    print(f"Wrote {args.output}")
    print(f"Wrote {args.json}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
