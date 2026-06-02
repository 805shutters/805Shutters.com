#!/usr/bin/env python3
"""Small live-site SEO audit for 805shutters.com.

The script intentionally uses only the Python standard library so it can run on
the local machine without a package install.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import asdict, dataclass
from html.parser import HTMLParser
from typing import Any


DEFAULT_USER_AGENT = "805-seo-audit/1.0 (+https://www.805shutters.com/)"
REQUEST_TIMEOUT_SECONDS = 10


@dataclass
class PageAudit:
    url: str
    status: int | None
    title: str
    description: str
    canonical: str
    robots: str
    h1: list[str]
    h2_count: int
    word_count: int
    http_asset_count: int
    vague_link_count: int
    missing_alt_count: int
    issue_flags: list[str]


class PageParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.title = ""
        self.description = ""
        self.canonical = ""
        self.robots = ""
        self.h1: list[str] = []
        self.h2_count = 0
        self.text_parts: list[str] = []
        self.http_asset_count = 0
        self.vague_link_count = 0
        self.missing_alt_count = 0
        self._current_tag: str | None = None
        self._current_link_href: str | None = None
        self._current_link_text: list[str] = []
        self._current_h1_text: list[str] | None = None
        self._tag_stack: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attrs_map = {name.lower(): value or "" for name, value in attrs}
        tag = tag.lower()
        self._current_tag = tag
        self._tag_stack.append(tag)

        if tag == "meta":
            name = attrs_map.get("name", "").lower()
            prop = attrs_map.get("property", "").lower()
            content = attrs_map.get("content", "")
            if name == "description":
                self.description = content.strip()
            elif name == "robots":
                self.robots = content.strip()
            elif prop == "og:description" and not self.description:
                self.description = content.strip()
        elif tag == "link" and attrs_map.get("rel", "").lower() == "canonical":
            self.canonical = attrs_map.get("href", "").strip()
        elif tag == "a":
            self._current_link_href = attrs_map.get("href", "")
            self._current_link_text = []
        elif tag == "h1":
            self._current_h1_text = []
        elif tag == "h2":
            self.h2_count += 1
        elif tag == "img":
            if self._is_visible_content_image(attrs_map) and not attrs_map.get("alt", "").strip():
                self.missing_alt_count += 1

    def _is_visible_content_image(self, attrs_map: dict[str, str]) -> bool:
        if attrs_map.get("role", "").lower() == "presentation":
            return False
        if attrs_map.get("aria-hidden", "").lower() == "true":
            return False
        style = attrs_map.get("style", "").replace(" ", "").lower()
        if "display:none" in style or "visibility:hidden" in style:
            return False
        if attrs_map.get("width") == "1" and attrs_map.get("height") == "1":
            return False
        src = attrs_map.get("src", "")
        return not any(token in src for token in ("facebook.com/tr", "stats.wp.com", "googleads"))

    def handle_endtag(self, tag: str) -> None:
        tag = tag.lower()
        if tag == "a" and self._current_link_href:
            text = " ".join("".join(self._current_link_text).split()).lower()
            if text in {"learn more", "click here", "more", "read more"}:
                self.vague_link_count += 1
            self._current_link_href = None
            self._current_link_text = []
        elif tag == "h1" and self._current_h1_text is not None:
            heading = " ".join("".join(self._current_h1_text).split())
            if heading:
                self.h1.append(heading)
            self._current_h1_text = None
        if tag in self._tag_stack:
            while self._tag_stack:
                popped = self._tag_stack.pop()
                if popped == tag:
                    break
        self._current_tag = None

    def handle_data(self, data: str) -> None:
        text = data.strip()
        if not text:
            return
        if self._in_tag("title"):
            self.title += text
        elif self._current_h1_text is not None:
            self._current_h1_text.append(text)
        elif not self._in_any_tag({"script", "style", "noscript"}):
            self.text_parts.append(text)
        if self._current_link_href:
            self._current_link_text.append(text)

    def _in_tag(self, tag: str) -> bool:
        return tag in self._tag_stack

    def _in_any_tag(self, tags: set[str]) -> bool:
        return any(tag in self._tag_stack for tag in tags)


def fetch(url: str) -> tuple[int | None, str]:
    request = urllib.request.Request(url, headers={"User-Agent": DEFAULT_USER_AGENT})
    try:
        with urllib.request.urlopen(request, timeout=REQUEST_TIMEOUT_SECONDS) as response:
            charset = response.headers.get_content_charset() or "utf-8"
            return response.status, response.read().decode(charset, errors="replace")
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        return exc.code, body
    except Exception as exc:
        return None, f"FETCH_ERROR: {exc}"


def get_json(url: str) -> Any:
    status, body = fetch(url)
    if status is None or status >= 400:
        return None
    return json.loads(body)


def sitemap_urls(base_url: str) -> list[str]:
    index_url = urllib.parse.urljoin(base_url, "/sitemap_index.xml")
    status, body = fetch(index_url)
    if status is None or status >= 400:
        return []

    ns = {"sm": "http://www.sitemaps.org/schemas/sitemap/0.9"}
    root = ET.fromstring(body)
    sitemap_locs = [node.text or "" for node in root.findall(".//sm:sitemap/sm:loc", ns)]
    urls: list[str] = []

    for loc in sitemap_locs:
        status, sitemap = fetch(loc)
        if status is None or status >= 400:
            continue
        child = ET.fromstring(sitemap)
        urls.extend(node.text or "" for node in child.findall(".//sm:url/sm:loc", ns))
    return sorted(set(url for url in urls if url))


def wordpress_collection(base_url: str, collection: str) -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []
    page = 1
    while True:
        params = urllib.parse.urlencode(
            {
                "per_page": 100,
                "page": page,
                "_fields": "id,slug,link,title,modified,date,status,parent",
            }
        )
        url = urllib.parse.urljoin(base_url, f"/wp-json/wp/v2/{collection}?{params}")
        data = get_json(url)
        if not isinstance(data, list) or not data:
            break
        records.extend(data)
        if len(data) < 100:
            break
        page += 1
        time.sleep(0.2)
    return records


def audit_page(url: str, base_url: str) -> PageAudit:
    status, body = fetch(url)
    parser = PageParser()
    if status is not None and status < 400:
        parser.feed(body)

    word_count = len(re.findall(r"\b[\w'-]+\b", " ".join(parser.text_parts)))
    base_host = urllib.parse.urlparse(base_url).netloc.replace("www.", "")
    first_party_http_refs = [
        ref
        for ref in re.findall(r"http://[^\"'<>\\s]+", body)
        if urllib.parse.urlparse(ref).netloc.replace("www.", "") == base_host
    ]
    parser.http_asset_count = len(set(first_party_http_refs))
    issue_flags: list[str] = []
    if status != 200:
        issue_flags.append("non_200")
    if not parser.title.strip():
        issue_flags.append("missing_title")
    if not parser.description.strip():
        issue_flags.append("missing_description")
    if not parser.canonical.strip() and "noindex" not in parser.robots.lower():
        issue_flags.append("missing_canonical")
    if len(parser.h1) != 1:
        issue_flags.append("h1_count")
    if parser.vague_link_count:
        issue_flags.append("vague_links")
    if parser.http_asset_count:
        issue_flags.append("http_assets")
    if parser.missing_alt_count:
        issue_flags.append("missing_alt")
    if word_count < 250 and "noindex" not in parser.robots.lower():
        issue_flags.append("thin_indexable_content")

    return PageAudit(
        url=url,
        status=status,
        title=" ".join(parser.title.split()),
        description=" ".join(parser.description.split()),
        canonical=parser.canonical,
        robots=parser.robots,
        h1=parser.h1,
        h2_count=parser.h2_count,
        word_count=word_count,
        http_asset_count=parser.http_asset_count,
        vague_link_count=parser.vague_link_count,
        missing_alt_count=parser.missing_alt_count,
        issue_flags=issue_flags,
    )


def render_markdown(report: dict[str, Any]) -> str:
    lines = [
        "# 805 Shutters site audit",
        "",
        f"Generated: {report['generated_at']}",
        f"Base URL: {report['base_url']}",
        "",
        "## Summary",
        "",
    ]
    for key, value in report["summary"].items():
        lines.append(f"- {key}: {value}")

    lines.extend(["", "## Highest priority page issues", ""])
    flagged = [
        page
        for page in report["pages"]
        if page["issue_flags"]
        and "noindex" not in page.get("robots", "").lower()
    ]
    for page in flagged[:30]:
        lines.append(f"- {page['url']}")
        lines.append(f"  - Flags: {', '.join(page['issue_flags'])}")
        lines.append(f"  - Title: {page['title'] or '(missing)'}")

    lines.extend(["", "## Public noindex posts", ""])
    for post in report["wordpress"]["posts"][:30]:
        title = post.get("title", {}).get("rendered", "").strip() or "(blank title)"
        lines.append(f"- {title}: {post.get('link')}")

    lines.append("")
    return "\n".join(lines)


def audit_urls(urls: list[str], base_url: str, workers: int) -> list[dict[str, Any]]:
    if not urls:
        return []
    results: list[dict[str, Any]] = []
    with ThreadPoolExecutor(max_workers=max(workers, 1)) as executor:
        futures = {executor.submit(audit_page, url, base_url): url for url in urls}
        for future in as_completed(futures):
            results.append(asdict(future.result()))
    return sorted(results, key=lambda page: page["url"])


def build_report(base_url: str, post_sample: int, workers: int) -> dict[str, Any]:
    base_url = base_url.rstrip("/")
    urls = sitemap_urls(base_url)
    pages = audit_urls(urls, base_url, workers)
    wp_pages = wordpress_collection(base_url, "pages")
    wp_posts = wordpress_collection(base_url, "posts")
    accessible_noindex_posts = []
    sampled_posts = [post for post in wp_posts[:post_sample] if post.get("link")]
    sampled_post_audits = audit_urls(
        [post["link"] for post in sampled_posts],
        base_url,
        min(workers, 4),
    )
    audit_by_url = {audit["url"]: audit for audit in sampled_post_audits}
    for post in sampled_posts:
        audit = audit_by_url.get(post["link"])
        if audit and audit["status"] == 200 and "noindex" in audit["robots"].lower():
            accessible_noindex_posts.append(post)

    summary = {
        "sitemap_urls": len(urls),
        "wp_pages": len(wp_pages),
        "wp_posts": len(wp_posts),
        "accessible_noindex_posts_sampled": len(accessible_noindex_posts),
        "indexable_pages_with_vague_links": sum(
            1
            for page in pages
            if page["vague_link_count"] and "noindex" not in page["robots"].lower()
        ),
        "indexable_pages_with_http_assets": sum(
            1
            for page in pages
            if page["http_asset_count"] and "noindex" not in page["robots"].lower()
        ),
        "indexable_pages_with_missing_alt": sum(
            1
            for page in pages
            if page["missing_alt_count"] and "noindex" not in page["robots"].lower()
        ),
    }

    return {
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "base_url": base_url,
        "summary": summary,
        "pages": pages,
        "wordpress": {
            "pages": wp_pages,
            "posts": accessible_noindex_posts,
        },
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url", default="https://www.805shutters.com")
    parser.add_argument("--output", default="reports/site-audit.json")
    parser.add_argument("--markdown", default="reports/site-audit.md")
    parser.add_argument("--post-sample", type=int, default=20)
    parser.add_argument("--workers", type=int, default=8)
    args = parser.parse_args()

    report = build_report(args.base_url, max(args.post_sample, 0), max(args.workers, 1))
    with open(args.output, "w", encoding="utf-8") as handle:
        json.dump(report, handle, indent=2, sort_keys=True)
        handle.write("\n")
    with open(args.markdown, "w", encoding="utf-8") as handle:
        handle.write(render_markdown(report))
    print(f"Wrote {args.output}")
    print(f"Wrote {args.markdown}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
