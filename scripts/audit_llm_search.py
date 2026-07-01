#!/usr/bin/env python3
"""Audit LLM-search readiness for the public 805 Shutters site."""

from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from html.parser import HTMLParser
from typing import Iterable
from urllib.parse import urljoin, urlparse
from urllib.request import Request, urlopen


DEFAULT_REQUIRED_PATHS = [
    "/llms.txt",
    "/ai-search-feed.json",
    "/answers.json",
    "/ai-site-index.json",
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

REQUIRED_BOTS = [
    "OAI-SearchBot",
    "ChatGPT-User",
    "Googlebot",
    "Bingbot",
    "PerplexityBot",
]

REQUIRED_LLMS_SECTIONS = [
    "## Entity facts",
    "## Machine-readable feeds",
    "## Best citation targets by user intent",
    "## Answer pages",
    "## Citation guidance",
]

REQUIRED_FEED_KEYS = [
    "schemaVersion",
    "entity",
    "machineReadableFeeds",
    "answerCitationFeed",
    "siteIndexFeed",
    "citationTargets",
    "answerPages",
    "servicePages",
    "citationGuidance",
]

REQUIRED_ANSWER_FEED_KEYS = [
    "schemaVersion",
    "publisher",
    "citationGuidance",
    "answerCount",
    "sourcePages",
    "answers",
]

REQUIRED_MACHINE_FEED_PATHS = {
    "/llms.txt",
    "/ai-search-feed.json",
    "/answers.json",
    "/ai-site-index.json",
}

REQUIRED_SITE_INDEX_KEYS = [
    "schemaVersion",
    "publisher",
    "pageCount",
    "pageTypes",
    "machineReadableFeeds",
    "indexingGuidance",
    "pages",
]

REQUIRED_SITE_INDEX_PATHS = {
    "/",
    "/book-consultation/",
    "/window-treatment-comparison-guide/",
    "/commercial-window-coverings/",
    "/best-window-treatments-ventura-county/",
}

REQUIRED_PROOF_PATHS = {
    "/best-window-treatments-ventura-county/",
    "/plantation-shutters-vs-shades-ventura-county/",
    "/custom-blinds-shades-shutters-camarillo/",
    "/commercial-roller-shades-ventura-county/",
    "/sliding-door-window-treatments-ventura-county/",
    "/motorized-window-shades-ventura-county/",
}

REQUIRED_PROOF_PHRASES = [
    "Local proof",
    "At-a-glance facts",
    "Service area",
    "Products compared:",
    "Free consultations compare",
]


@dataclass
class PageAudit:
    path: str
    status: int
    title: str
    description: str
    canonical: str
    h1_count: int
    h1: str
    word_count: int
    jsonld_count: int
    flags: list[str]


class HtmlAuditParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.title_parts: list[str] = []
        self.description = ""
        self.canonical = ""
        self.h1_parts: list[str] = []
        self.text_parts: list[str] = []
        self.jsonld_count = 0
        self._in_title = False
        self._in_h1 = False
        self._skip_depth = 0

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attr_map = {key.lower(): value or "" for key, value in attrs}
        tag = tag.lower()
        if tag in {"script", "style"}:
            if tag == "script" and attr_map.get("type") == "application/ld+json":
                self.jsonld_count += 1
            self._skip_depth += 1
        if tag == "title":
            self._in_title = True
        if tag == "h1":
            self._in_h1 = True
        if tag == "meta" and attr_map.get("name", "").lower() == "description":
            self.description = attr_map.get("content", "").strip()
        if tag == "link" and attr_map.get("rel", "").lower() == "canonical":
            self.canonical = attr_map.get("href", "").strip()

    def handle_endtag(self, tag: str) -> None:
        tag = tag.lower()
        if tag in {"script", "style"} and self._skip_depth:
            self._skip_depth -= 1
        if tag == "title":
            self._in_title = False
        if tag == "h1":
            self._in_h1 = False

    def handle_data(self, data: str) -> None:
        text = " ".join(data.split())
        if not text:
            return
        if self._in_title:
            self.title_parts.append(text)
        if self._in_h1:
            self.h1_parts.append(text)
        if not self._skip_depth:
            self.text_parts.append(text)


class FeedDiscoveryParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.alternate_paths: set[str] = set()
        self.meta_feed_paths: set[str] = set()

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attr_map = {key.lower(): value or "" for key, value in attrs}
        tag = tag.lower()
        if tag == "link":
            rel_values = {value.lower() for value in attr_map.get("rel", "").split()}
            href = attr_map.get("href", "")
            if "alternate" in rel_values and href:
                self.alternate_paths.add(urlparse(href).path or "/")
        if tag == "meta" and attr_map.get("name", "").lower() == "ai-search-feeds":
            for raw_url in attr_map.get("content", "").split(","):
                feed_path = urlparse(raw_url.strip()).path
                if feed_path:
                    self.meta_feed_paths.add(feed_path)


def fetch(url: str) -> tuple[int, str, str]:
    request = Request(
        url,
        headers={
            "User-Agent": "805Shutters-LLMSearchAudit/1.0 (+https://www.805shutters.com/)",
        },
    )
    with urlopen(request, timeout=30) as response:
        status = int(response.status)
        content_type = response.headers.get("content-type", "")
        charset = response.headers.get_content_charset() or "utf-8"
        body = response.read().decode(charset, "replace")
    return status, content_type, body


def words(text: str) -> int:
    return len(re.findall(r"[A-Za-z0-9]+(?:[-'][A-Za-z0-9]+)?", text))


def canonical_hosts(markdown: str, base_url: str) -> set[str]:
    hosts = {urlparse(base_url).netloc}
    match = re.search(r"^Website:\s+(https?://\S+)", markdown, re.MULTILINE)
    if match:
        hosts.add(urlparse(match.group(1)).netloc)
    return {host for host in hosts if host}


def internal_markdown_paths(markdown: str, allowed_hosts: set[str]) -> set[str]:
    paths: set[str] = set()
    for href in re.findall(r"\[[^\]]+\]\((https?://[^)]+)\)", markdown):
        parsed = urlparse(href)
        if parsed.netloc in allowed_hosts:
            paths.add(parsed.path or "/")
    return paths


def sitemap_paths(xml: str) -> set[str]:
    return {urlparse(loc).path or "/" for loc in re.findall(r"<loc>(.*?)</loc>", xml)}


def audit_html_feed_discovery(base_url: str) -> dict[str, object]:
    status, content_type, body = fetch(f"{base_url}/")
    flags: list[str] = []

    if status != 200:
        flags.append(f"status_{status}")
    if "text/html" not in content_type:
        flags.append("unexpected_content_type")

    parser = FeedDiscoveryParser()
    parser.feed(body)

    missing_alternates = sorted(REQUIRED_MACHINE_FEED_PATHS - parser.alternate_paths)
    missing_meta_feeds = sorted(REQUIRED_MACHINE_FEED_PATHS - parser.meta_feed_paths)
    if missing_alternates:
        flags.append(f"missing_alternate_feed_links:{len(missing_alternates)}")
    if missing_meta_feeds:
        flags.append(f"missing_meta_feed_links:{len(missing_meta_feeds)}")

    return {
        "status": status,
        "content_type": content_type,
        "flags": flags,
        "alternate_feed_count": len(parser.alternate_paths & REQUIRED_MACHINE_FEED_PATHS),
        "meta_feed_count": len(parser.meta_feed_paths & REQUIRED_MACHINE_FEED_PATHS),
        "missing_alternate_feeds": missing_alternates,
        "missing_meta_feeds": missing_meta_feeds,
    }


def audit_ai_feed(base_url: str) -> dict[str, object]:
    status, content_type, body = fetch(f"{base_url}/ai-search-feed.json")
    flags: list[str] = []

    if status != 200:
        flags.append(f"status_{status}")
    if "application/json" not in content_type:
        flags.append("unexpected_content_type")

    try:
        payload = json.loads(body)
    except json.JSONDecodeError:
        return {
            "status": status,
            "content_type": content_type,
            "flags": [*flags, "invalid_json"],
            "citation_target_count": 0,
            "answer_page_count": 0,
            "service_page_count": 0,
            "answer_citation_count": 0,
            "site_index_page_count": 0,
        }

    missing_keys = [key for key in REQUIRED_FEED_KEYS if key not in payload]
    if missing_keys:
        flags.append(f"missing_keys:{len(missing_keys)}")

    machine_feeds = payload.get("machineReadableFeeds", [])
    machine_feed_urls = {urlparse(item.get("url", "")).path for item in machine_feeds if isinstance(item, dict)}
    if "/llms.txt" not in machine_feed_urls:
        flags.append("missing_llms_feed_link")
    if "/ai-search-feed.json" not in machine_feed_urls:
        flags.append("missing_self_feed_link")
    if "/answers.json" not in machine_feed_urls:
        flags.append("missing_answers_feed_link")
    if "/ai-site-index.json" not in machine_feed_urls:
        flags.append("missing_site_index_feed_link")

    citation_target_count = len(payload.get("citationTargets", [])) if isinstance(payload.get("citationTargets"), list) else 0
    answer_page_count = len(payload.get("answerPages", [])) if isinstance(payload.get("answerPages"), list) else 0
    service_page_count = len(payload.get("servicePages", [])) if isinstance(payload.get("servicePages"), list) else 0
    answer_citation_feed = payload.get("answerCitationFeed", {})
    answer_citation_count = (
        int(answer_citation_feed.get("answerCount", 0))
        if isinstance(answer_citation_feed, dict) and isinstance(answer_citation_feed.get("answerCount", 0), int)
        else 0
    )
    site_index_feed = payload.get("siteIndexFeed", {})
    site_index_page_count = (
        int(site_index_feed.get("pageCount", 0))
        if isinstance(site_index_feed, dict) and isinstance(site_index_feed.get("pageCount", 0), int)
        else 0
    )

    if citation_target_count < 8:
        flags.append("thin_citation_targets")
    if answer_page_count < 6:
        flags.append("thin_answer_pages")
    if service_page_count < 5:
        flags.append("thin_service_pages")
    if answer_citation_count < 24:
        flags.append("thin_answer_citations")
    if site_index_page_count < 100:
        flags.append("thin_site_index")

    return {
        "status": status,
        "content_type": content_type,
        "flags": flags,
        "citation_target_count": citation_target_count,
        "answer_page_count": answer_page_count,
        "service_page_count": service_page_count,
        "answer_citation_count": answer_citation_count,
        "site_index_page_count": site_index_page_count,
    }


def audit_answer_feed(base_url: str) -> dict[str, object]:
    status, content_type, body = fetch(f"{base_url}/answers.json")
    flags: list[str] = []

    if status != 200:
        flags.append(f"status_{status}")
    if "application/json" not in content_type:
        flags.append("unexpected_content_type")

    try:
        payload = json.loads(body)
    except json.JSONDecodeError:
        return {
            "status": status,
            "content_type": content_type,
            "flags": [*flags, "invalid_json"],
            "answer_count": 0,
            "source_page_count": 0,
            "citation_path_count": 0,
        }

    missing_keys = [key for key in REQUIRED_ANSWER_FEED_KEYS if key not in payload]
    if missing_keys:
        flags.append(f"missing_keys:{len(missing_keys)}")

    answers = payload.get("answers", [])
    source_pages = payload.get("sourcePages", [])
    answer_count = len(answers) if isinstance(answers, list) else 0
    source_page_count = len(source_pages) if isinstance(source_pages, list) else 0
    declared_answer_count = payload.get("answerCount")

    if declared_answer_count != answer_count:
        flags.append("answer_count_mismatch")
    if answer_count < 24:
        flags.append("thin_answers")
    if source_page_count < 6:
        flags.append("thin_source_pages")

    citation_paths = {
        item.get("citationPath")
        for item in answers
        if isinstance(item, dict) and isinstance(item.get("citationPath"), str)
    }
    private_citation_paths = [
        path for path in citation_paths if path.startswith(("/api/", "/crm/", "/quote/"))
    ]
    if private_citation_paths:
        flags.append(f"private_citation_paths:{len(private_citation_paths)}")
    if len(citation_paths) < 6:
        flags.append("thin_citation_paths")

    return {
        "status": status,
        "content_type": content_type,
        "flags": flags,
        "answer_count": answer_count,
        "source_page_count": source_page_count,
        "citation_path_count": len(citation_paths),
    }


def audit_site_index_feed(base_url: str) -> dict[str, object]:
    status, content_type, body = fetch(f"{base_url}/ai-site-index.json")
    flags: list[str] = []

    if status != 200:
        flags.append(f"status_{status}")
    if "application/json" not in content_type:
        flags.append("unexpected_content_type")

    try:
        payload = json.loads(body)
    except json.JSONDecodeError:
        return {
            "status": status,
            "content_type": content_type,
            "flags": [*flags, "invalid_json"],
            "page_count": 0,
            "page_type_count": 0,
        }

    missing_keys = [key for key in REQUIRED_SITE_INDEX_KEYS if key not in payload]
    if missing_keys:
        flags.append(f"missing_keys:{len(missing_keys)}")

    pages = payload.get("pages", [])
    page_count = len(pages) if isinstance(pages, list) else 0
    declared_page_count = payload.get("pageCount")
    page_types = payload.get("pageTypes", {})
    page_type_count = len(page_types) if isinstance(page_types, dict) else 0

    if declared_page_count != page_count:
        flags.append("page_count_mismatch")
    if page_count < 100:
        flags.append("thin_page_inventory")
    if page_type_count < 6:
        flags.append("thin_page_types")

    page_paths = {
        item.get("path")
        for item in pages
        if isinstance(item, dict) and isinstance(item.get("path"), str)
    }
    private_page_paths = [path for path in page_paths if path.startswith(("/api/", "/crm/", "/quote/"))]
    if private_page_paths:
        flags.append(f"private_page_paths:{len(private_page_paths)}")

    missing_required_paths = sorted(path for path in REQUIRED_SITE_INDEX_PATHS if path not in page_paths)
    if missing_required_paths:
        flags.append(f"missing_required_site_paths:{len(missing_required_paths)}")

    return {
        "status": status,
        "content_type": content_type,
        "flags": flags,
        "page_count": page_count,
        "page_type_count": page_type_count,
    }


def audit_page(base_url: str, path: str) -> PageAudit:
    url = urljoin(base_url, path)
    status, _content_type, body = fetch(url)

    parser = HtmlAuditParser()
    parser.feed(body)

    title = " ".join(parser.title_parts).strip()
    h1 = " ".join(parser.h1_parts).strip()
    text = " ".join(parser.text_parts)
    count = words(text)
    flags: list[str] = []

    if status != 200:
        flags.append(f"status_{status}")
    if not title:
        flags.append("missing_title")
    if not parser.description:
        flags.append("missing_description")
    if not parser.canonical:
        flags.append("missing_canonical")
    if not h1:
        flags.append("missing_h1")
    if parser.h1_parts and len(parser.h1_parts) != 1:
        flags.append("multiple_h1")
    if count < 250:
        flags.append("thin_answer_content")
    if parser.jsonld_count < 1:
        flags.append("missing_jsonld")
    if path in REQUIRED_PROOF_PATHS:
        missing_proof_phrases = [phrase for phrase in REQUIRED_PROOF_PHRASES if phrase not in text]
        if missing_proof_phrases:
            flags.append(f"missing_proof_surface:{len(missing_proof_phrases)}")

    return PageAudit(
        path=path,
        status=status,
        title=title,
        description=parser.description,
        canonical=parser.canonical,
        h1_count=len(parser.h1_parts),
        h1=h1,
        word_count=count,
        jsonld_count=parser.jsonld_count,
        flags=flags,
    )


def markdown_table(headers: Iterable[str], rows: Iterable[Iterable[object]]) -> list[str]:
    header_list = list(headers)
    lines = [
        "| " + " | ".join(header_list) + " |",
        "| " + " | ".join("---" for _ in header_list) + " |",
    ]
    for row in rows:
        lines.append("| " + " | ".join(str(item) for item in row) + " |")
    return lines


def build_report(payload: dict) -> str:
    lines = [
        "# 805 Shutters LLM search readiness",
        "",
        f"Generated: {payload['generated_at']}",
        f"Base URL: {payload['base_url']}",
        f"Verdict: {payload['verdict']}",
        "",
        "## Access Checks",
        "",
        *markdown_table(
            ["Check", "Status", "Details"],
            [
                ["robots.txt", payload["robots"]["status"], ", ".join(payload["robots"]["flags"]) or "clean"],
                ["HTML feed discovery", payload["feed_discovery"]["status"], ", ".join(payload["feed_discovery"]["flags"]) or "clean"],
                ["llms.txt", payload["llms"]["status"], ", ".join(payload["llms"]["flags"]) or "clean"],
                ["ai-search-feed.json", payload["ai_feed"]["status"], ", ".join(payload["ai_feed"]["flags"]) or "clean"],
                ["answers.json", payload["answer_feed"]["status"], ", ".join(payload["answer_feed"]["flags"]) or "clean"],
                ["ai-site-index.json", payload["site_index"]["status"], ", ".join(payload["site_index"]["flags"]) or "clean"],
                ["sitemap.xml", payload["sitemap"]["status"], ", ".join(payload["sitemap"]["flags"]) or "clean"],
            ],
        ),
        "",
        "## Page Checks",
        "",
        *markdown_table(
            ["Path", "Words", "H1s", "JSON-LD", "Flags"],
            [
                [
                    page["path"],
                    page["word_count"],
                    page["h1_count"],
                    page["jsonld_count"],
                    ", ".join(page["flags"]) or "clean",
                ]
                for page in payload["pages"]
            ],
        ),
        "",
        "## LLM Citation Surface",
        "",
        f"- Internal links in llms.txt: {payload['llms']['internal_link_count']}",
        f"- HTML alternate feed links: {payload['feed_discovery']['alternate_feed_count']}",
        f"- HTML meta feed links: {payload['feed_discovery']['meta_feed_count']}",
        f"- AI feed citation targets: {payload['ai_feed']['citation_target_count']}",
        f"- AI feed answer pages: {payload['ai_feed']['answer_page_count']}",
        f"- AI feed service pages: {payload['ai_feed']['service_page_count']}",
        f"- AI feed answer citations: {payload['ai_feed']['answer_citation_count']}",
        f"- AI feed site index pages: {payload['ai_feed']['site_index_page_count']}",
        f"- Answer feed answers: {payload['answer_feed']['answer_count']}",
        f"- Answer feed citation paths: {payload['answer_feed']['citation_path_count']}",
        f"- Site index pages: {payload['site_index']['page_count']}",
        f"- Site index page types: {payload['site_index']['page_type_count']}",
        f"- Required paths found in llms.txt: {payload['llms']['required_paths_found']}/{payload['required_path_count']}",
        f"- Required paths found in sitemap.xml: {payload['sitemap']['required_paths_found']}/{payload['required_path_count']}",
    ]
    return "\n".join(lines) + "\n"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", default="https://www.805shutters.com")
    parser.add_argument("--output", default="reports/llm-search-readiness.md")
    parser.add_argument("--json", default="reports/llm-search-readiness.json")
    parser.add_argument("--required-path", action="append", dest="required_paths")
    args = parser.parse_args()

    base_url = args.base_url.rstrip("/")
    required_paths = args.required_paths or DEFAULT_REQUIRED_PATHS
    generated_at = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")

    robots_status, _robots_type, robots_body = fetch(f"{base_url}/robots.txt")
    feed_discovery = audit_html_feed_discovery(base_url)
    llms_status, llms_type, llms_body = fetch(f"{base_url}/llms.txt")
    ai_feed = audit_ai_feed(base_url)
    answer_feed = audit_answer_feed(base_url)
    site_index = audit_site_index_feed(base_url)
    sitemap_status, _sitemap_type, sitemap_body = fetch(f"{base_url}/sitemap.xml")

    robots_flags = [f"missing_{bot}" for bot in REQUIRED_BOTS if bot not in robots_body]
    if "Sitemap:" not in robots_body:
        robots_flags.append("missing_sitemap_directive")

    llms_paths = internal_markdown_paths(llms_body, canonical_hosts(llms_body, base_url))
    llms_flags = [f"missing_section:{section}" for section in REQUIRED_LLMS_SECTIONS if section not in llms_body]
    if "text/plain" not in llms_type:
        llms_flags.append("unexpected_content_type")

    sitemap_path_set = sitemap_paths(sitemap_body)
    sitemap_flags = []

    non_html_required_paths = REQUIRED_MACHINE_FEED_PATHS
    missing_llms_paths = sorted(path for path in required_paths if path != "/llms.txt" and path not in llms_paths)
    missing_sitemap_paths = sorted(path for path in required_paths if path not in non_html_required_paths and path not in sitemap_path_set)
    if missing_llms_paths:
        llms_flags.append(f"missing_required_links:{len(missing_llms_paths)}")
    if missing_sitemap_paths:
        sitemap_flags.append(f"missing_required_paths:{len(missing_sitemap_paths)}")

    pages = [audit_page(base_url, path) for path in required_paths if path not in non_html_required_paths]
    page_issue_count = sum(len(page.flags) for page in pages)
    access_issue_count = (
        len(robots_flags)
        + len(feed_discovery["flags"])
        + len(llms_flags)
        + len(ai_feed["flags"])
        + len(answer_feed["flags"])
        + len(site_index["flags"])
        + len(sitemap_flags)
    )
    verdict = "Clean: LLM citation surface is crawlable and structured" if not page_issue_count and not access_issue_count else "Needs attention"

    payload = {
        "generated_at": generated_at,
        "base_url": base_url,
        "verdict": verdict,
        "required_path_count": len(required_paths),
        "robots": {
            "status": robots_status,
            "flags": robots_flags,
        },
        "feed_discovery": feed_discovery,
        "llms": {
            "status": llms_status,
            "content_type": llms_type,
            "internal_link_count": len(llms_paths),
            "required_paths_found": len(required_paths) - len(missing_llms_paths),
            "missing_required_paths": missing_llms_paths,
            "flags": llms_flags,
        },
        "ai_feed": ai_feed,
        "answer_feed": answer_feed,
        "site_index": site_index,
        "sitemap": {
            "status": sitemap_status,
            "required_paths_found": len(required_paths) - len(missing_sitemap_paths),
            "missing_required_paths": missing_sitemap_paths,
            "flags": sitemap_flags,
        },
        "pages": [asdict(page) for page in pages],
    }

    with open(args.json, "w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2)
        handle.write("\n")
    with open(args.output, "w", encoding="utf-8") as handle:
        handle.write(build_report(payload))

    print(f"Wrote {args.output}")
    print(f"Wrote {args.json}")
    return 0 if verdict.startswith("Clean") else 1


if __name__ == "__main__":
    raise SystemExit(main())
