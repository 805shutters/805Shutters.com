# PR #54 AI-feed follow-up

The pre-change PR preview at db871887 returned 200 for all four feeds, sitemap and homepage. The site index still listed all ten consolidated pages. The county drapery URL also remained once in llms.txt, once in ai-search-feed.json, and six times as an absolute URL plus five citationPath values in answers.json.

## Changes

- A shared consolidated-page target map now supplies sitemap exclusions, AI site-index exclusions and replacement answer citation paths. Actual 301 rules remain in next.config.mjs.
- /ai-site-index.json: remove the ten consolidated records and update derived counts.
- /llms.txt: replace only the county drapery answer-page URL with /drapery/.
- /ai-search-feed.json: replace that answer-page URL and update the derived site-index page count.
- /answers.json: replace the six absolute URLs and five relative citation paths with the final drapery hub. Answers, questions, titles, descriptions and other wording are preserved.
- The four previously changed internal hrefs now use /blinds/ or /drapery/ relative paths. Anchor labels are unchanged.

The homepage paths prop belongs to BusinessStructuredData in src/app/layout.tsx, and is supplied by buildSitemapEntries(). It already excluded all ten paths on the pre-change preview, as did /sitemap.xml. No layout, homepage, BusinessStructuredData or protected shade-page source change was needed. Both held shade-city paths remain in the 142-entry array and sitemap.

## Local CI crawl

The existing public-site-integrity test starts a local Next production build. It now parses the four feeds, including nested JSON URL/path fields and Markdown URLs, and checks every 805 URL against the local server with redirect: manual. Non-200, redirect, HTTP/non-www, invalid JSON and feed endpoint failures fail the test. Third-party profile URLs are excluded; CI does not request live production, preview, social networks or directories.

The 180-second crawl timeout is unchanged. The successful local audit covered 142 sitemap pages, four feeds and 166 unique targets in 5.4 seconds. Regression cases cover 301, 308, 404 and 503 in every feed, Markdown URL-label delimiters, nested citation paths and local-only request routing. The existing protected homepage OAuth anchor exception is unchanged and does not exempt feed URLs.

## Validation before push

- Full unit suite: 9,127 passed, 28 skipped (723 test files passed, 5 skipped).
- Typecheck and production build passed.
- Redirect and integrity suite: 76 passed, including the expanded local-build crawl.
- Local HTTP requests: four feeds, sitemap and homepage all return 200; no old URL appears in any of them.
- Exact before/after feed comparison allows only replacement citation URLs, ten inventory removals and derived counts. No answer wording changed.
- All 142 remaining sitemap pages return 200 and match normalized baseline HTML after only the four authorized relative href substitutions. Executable hydration/analytics scripts, Next asset references, deployment IDs and CSS module build hashes are excluded. Homepage, /shades/ and both held shade-city pages are unchanged.

The pushed commit's GitHub CI and preview evidence will be recorded in the PR description and canonical workspace report after deployment. Do not merge this PR.
