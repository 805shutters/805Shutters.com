#!/usr/bin/env python3
"""Compare the live WordPress SEO surface with the rebuilt Next/Vercel site."""

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


USER_AGENT = "805-seo-parity-audit/1.0 (+https://www.805shutters.com/)"
TIMEOUT_SECONDS = 12


@dataclass
class PageSnapshot:
  path: str
  url: str
  status: int | None
  title: str
  description: str
  canonical: str
  robots: str
  h1: list[str]
  word_count: int
  missing_alt_count: int
  structured_data_count: int
  error: str | None = None


@dataclass
class PageComparison:
  path: str
  live: PageSnapshot | None
  candidate: PageSnapshot | None
  flags: list[str]
  title_changed: bool
  description_changed: bool
  live_word_count: int
  candidate_word_count: int


class SeoParser(HTMLParser):
  def __init__(self) -> None:
    super().__init__(convert_charrefs=True)
    self.title = ""
    self.description = ""
    self.canonical = ""
    self.robots = ""
    self.h1: list[str] = []
    self.text_parts: list[str] = []
    self.missing_alt_count = 0
    self.structured_data_count = 0
    self._stack: list[str] = []
    self._h1_text: list[str] | None = None

  def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
    tag = tag.lower()
    attrs_map = {name.lower(): value or "" for name, value in attrs}
    self._stack.append(tag)
    if tag == "meta":
      name = attrs_map.get("name", "").lower()
      content = attrs_map.get("content", "").strip()
      if name == "description":
        self.description = content
      elif name == "robots":
        self.robots = content
    elif tag == "link" and "canonical" in attrs_map.get("rel", "").lower():
      self.canonical = attrs_map.get("href", "").strip()
    elif tag == "h1":
      self._h1_text = []
    elif tag == "img" and not attrs_map.get("alt", "").strip():
      src = attrs_map.get("src", "")
      if not any(token in src for token in ("facebook.com/tr", "stats.wp.com", "googleads")):
        self.missing_alt_count += 1
    elif tag == "script" and attrs_map.get("type", "").lower() == "application/ld+json":
      self.structured_data_count += 1

  def handle_endtag(self, tag: str) -> None:
    tag = tag.lower()
    if tag == "h1" and self._h1_text is not None:
      text = " ".join("".join(self._h1_text).split())
      if text:
        self.h1.append(text)
      self._h1_text = None
    if tag in self._stack:
      while self._stack:
        popped = self._stack.pop()
        if popped == tag:
          break

  def handle_data(self, data: str) -> None:
    text = data.strip()
    if not text:
      return
    if "title" in self._stack:
      self.title += text
    elif self._h1_text is not None:
      self._h1_text.append(text)
    elif not any(tag in self._stack for tag in ("script", "style", "noscript", "svg")):
      self.text_parts.append(text)


def normalize_text(value: str) -> str:
  return " ".join(value.split())


def normalize_path(path: str) -> str:
  if not path or path == "/":
    return "/"
  return "/" + path.strip("/") + "/"


def url_for(base_url: str, path: str) -> str:
  return base_url.rstrip("/") + normalize_path(path)


def asset_url_for(base_url: str, path: str) -> str:
  return base_url.rstrip("/") + "/" + path.lstrip("/")


def path_from_url(url: str) -> str:
  return normalize_path(urllib.parse.urlparse(url).path)


def fetch(url: str, attempts: int = 3) -> tuple[int | None, str, str | None]:
  last_error: str | None = None
  for attempt in range(attempts):
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    try:
      with urllib.request.urlopen(request, timeout=TIMEOUT_SECONDS) as response:
        charset = response.headers.get_content_charset() or "utf-8"
        return response.status, response.read().decode(charset, errors="replace"), None
    except urllib.error.HTTPError as exc:
      return exc.code, exc.read().decode("utf-8", errors="replace"), None
    except Exception as exc:  # noqa: BLE001 - standard-library script
      last_error = str(exc)
      time.sleep(0.35 * (attempt + 1))
  return None, "", last_error


def sitemap_urls(base_url: str) -> list[str]:
  urls = sitemap_urls_from_path(base_url, "/sitemap_index.xml")
  if urls:
    return urls
  return sitemap_urls_from_path(base_url, "/sitemap.xml")


def sitemap_urls_from_path(base_url: str, path: str) -> list[str]:
  status, body, error = fetch(asset_url_for(base_url, path), attempts=2)
  if error or status is None or status >= 400:
    return []
  ns = {"sm": "http://www.sitemaps.org/schemas/sitemap/0.9"}
  try:
    root = ET.fromstring(body)
  except ET.ParseError:
    return []
  urls = [node.text or "" for node in root.findall(".//sm:url/sm:loc", ns)]
  sitemap_locs = [node.text or "" for node in root.findall(".//sm:sitemap/sm:loc", ns)]
  for loc in sitemap_locs:
    rewritten = asset_url_for(base_url, urllib.parse.urlparse(loc).path)
    status, child_body, child_error = fetch(rewritten, attempts=2)
    if child_error or status is None or status >= 400:
      continue
    try:
      child = ET.fromstring(child_body)
    except ET.ParseError:
      continue
    urls.extend(node.text or "" for node in child.findall(".//sm:url/sm:loc", ns))
  return sorted(set(url for url in urls if url))


def snapshot_page(base_url: str, path: str) -> PageSnapshot:
  url = url_for(base_url, path)
  status, body, error = fetch(url)
  parser = SeoParser()
  if body:
    parser.feed(body)
  words = re.findall(r"\b[\w'-]+\b", " ".join(parser.text_parts))
  return PageSnapshot(
    path=normalize_path(path),
    url=url,
    status=status,
    title=normalize_text(parser.title),
    description=normalize_text(parser.description),
    canonical=parser.canonical,
    robots=parser.robots,
    h1=parser.h1,
    word_count=len(words),
    missing_alt_count=parser.missing_alt_count,
    structured_data_count=parser.structured_data_count,
    error=error,
  )


def compare_page(path: str, live: PageSnapshot | None, candidate: PageSnapshot | None) -> PageComparison:
  flags: list[str] = []
  if not candidate:
    flags.append("missing_candidate_path")
  elif candidate.status != 200:
    flags.append("candidate_non_200")
  if live and live.status == 200:
    live_noindex = "noindex" in live.robots.lower()
    candidate_noindex = bool(candidate and "noindex" in candidate.robots.lower())
    if not live_noindex and candidate_noindex:
      flags.append("candidate_noindex_but_live_indexable")
    if candidate and not candidate.title:
      flags.append("candidate_missing_title")
    if candidate and not candidate.description:
      flags.append("candidate_missing_description")
    if candidate and len(candidate.h1) != 1:
      flags.append("candidate_h1_count")
    if candidate and not candidate.canonical:
      flags.append("candidate_missing_canonical")
    if candidate and candidate.canonical and path_from_url(candidate.canonical) != path:
      flags.append("candidate_canonical_path_mismatch")
    if candidate and live.word_count >= 250 and candidate.word_count < max(180, int(live.word_count * 0.55)):
      flags.append("candidate_substantially_less_content")
    if candidate and candidate.structured_data_count == 0:
      flags.append("candidate_missing_structured_data")
    if candidate and candidate.missing_alt_count:
      flags.append("candidate_missing_image_alt")

  return PageComparison(
    path=path,
    live=live,
    candidate=candidate,
    flags=flags,
    title_changed=bool(live and candidate and live.title != candidate.title),
    description_changed=bool(live and candidate and live.description != candidate.description),
    live_word_count=live.word_count if live else 0,
    candidate_word_count=candidate.word_count if candidate else 0,
  )


def snapshot_many(base_url: str, paths: list[str], workers: int) -> dict[str, PageSnapshot]:
  snapshots: dict[str, PageSnapshot] = {}
  with ThreadPoolExecutor(max_workers=max(1, workers)) as executor:
    futures = {executor.submit(snapshot_page, base_url, path): path for path in paths}
    for future in as_completed(futures):
      snapshot = future.result()
      snapshots[snapshot.path] = snapshot
  return snapshots


def build_report(live_base: str, candidate_base: str, workers: int) -> dict[str, Any]:
  live_paths = sorted(set(path_from_url(url) for url in sitemap_urls(live_base)))
  candidate_paths = sorted(set(path_from_url(url) for url in sitemap_urls(candidate_base)))
  comparison_paths = sorted(set(live_paths) | set(candidate_paths))
  live_snapshots = snapshot_many(live_base, live_paths, workers)
  candidate_snapshots = snapshot_many(candidate_base, comparison_paths, workers)
  comparisons = [
    compare_page(path, live_snapshots.get(path), candidate_snapshots.get(path))
    for path in comparison_paths
  ]
  blocking = [comparison for comparison in comparisons if comparison.flags]
  return {
    "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    "live_base": live_base.rstrip("/"),
    "candidate_base": candidate_base.rstrip("/"),
    "summary": {
      "live_sitemap_paths": len(live_paths),
      "candidate_sitemap_paths": len(candidate_paths),
      "missing_candidate_paths": len(set(live_paths) - set(candidate_paths)),
      "extra_candidate_paths": len(set(candidate_paths) - set(live_paths)),
      "blocking_flagged_pages": len(blocking),
      "title_changed_pages": sum(1 for comparison in comparisons if comparison.title_changed),
      "description_changed_pages": sum(1 for comparison in comparisons if comparison.description_changed),
    },
    "missing_candidate_paths": sorted(set(live_paths) - set(candidate_paths)),
    "extra_candidate_paths": sorted(set(candidate_paths) - set(live_paths)),
    "comparisons": [asdict(comparison) for comparison in comparisons],
  }


def render_markdown(report: dict[str, Any]) -> str:
  lines = [
    "# 805 Shutters SEO parity audit",
    "",
    f"Generated: {report['generated_at']}",
    f"Live base: {report['live_base']}",
    f"Candidate base: {report['candidate_base']}",
    "",
    "## Summary",
    "",
  ]
  for key, value in report["summary"].items():
    lines.append(f"- {key}: {value}")
  lines.extend(["", "## Missing Candidate Paths", ""])
  if report["missing_candidate_paths"]:
    lines.extend(f"- {path}" for path in report["missing_candidate_paths"])
  else:
    lines.append("- None")
  lines.extend(["", "## Extra Candidate Paths", ""])
  if report["extra_candidate_paths"]:
    lines.extend(f"- {path}" for path in report["extra_candidate_paths"])
  else:
    lines.append("- None")
  lines.extend(["", "## Blocking SEO Flags", ""])
  flagged = [comparison for comparison in report["comparisons"] if comparison["flags"]]
  if not flagged:
    lines.append("- None")
  for comparison in flagged[:100]:
    lines.append(f"- {comparison['path']}: {', '.join(comparison['flags'])}")
    candidate = comparison.get("candidate") or {}
    lines.append(f"  - candidate status: {candidate.get('status')}")
    lines.append(f"  - candidate title: {candidate.get('title') or '(missing)'}")
  lines.extend(["", "## Metadata Changes", ""])
  changed = [
    comparison
    for comparison in report["comparisons"]
    if comparison["title_changed"] or comparison["description_changed"]
  ]
  if not changed:
    lines.append("- None")
  for comparison in changed[:40]:
    live = comparison.get("live") or {}
    candidate = comparison.get("candidate") or {}
    lines.append(f"- {comparison['path']}")
    if comparison["title_changed"]:
      lines.append(f"  - live title: {live.get('title')}")
      lines.append(f"  - candidate title: {candidate.get('title')}")
    if comparison["description_changed"]:
      lines.append(f"  - live description: {live.get('description')}")
      lines.append(f"  - candidate description: {candidate.get('description')}")
  lines.append("")
  return "\n".join(lines)


def main() -> int:
  parser = argparse.ArgumentParser()
  parser.add_argument("--live-base", default="https://www.805shutters.com")
  parser.add_argument("--candidate-base", required=True)
  parser.add_argument("--output", default="reports/seo-parity-audit.json")
  parser.add_argument("--markdown", default="reports/seo-parity-audit.md")
  parser.add_argument("--workers", type=int, default=6)
  args = parser.parse_args()

  report = build_report(args.live_base, args.candidate_base, max(1, args.workers))
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
