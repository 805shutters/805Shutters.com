# Public link, sitemap, and business-info audit

Scope: 805 Shutters only, production snapshot 2026-09-24 (America/Los_Angeles), base commit `1951709ec6ed4605b0090e5062c60ab43d46d908`. No Google account was opened. Only public pages and public machine-readable feeds were requested; the sign-in redirect was inspected without following it to the external authorization endpoint.

## Findings and changes

- Crawled all **152 sitemap pages** and **104 unique internal anchor targets**. All 152 sitemap URLs returned **200 without a redirect** and had exactly one canonical pointing to themselves.
- **Href changes: 0.** No public content anchors linked to 404s, the old `/motorized`, `/curtains`, or `/drapes` paths, HTTP URLs, or a non-www host.
- **Sitemap entries removed: 0.** No entry failed the status, redirect, or canonical checks. No pages were deleted or noindexed.
- **Business-info fixes: 0.** The observed business phone digits are 805-806-9344 and the email is `805@805shutters.com`. No `805-630-0848` or `805-269-6143` was found in the audited public content/JSON-LD/feeds or public marketing source search. Business identity fields use 805 Shutters.
- Phone display variants `805-806-9344` and `(805) 806-9344` represent the same correct number; `tel:+18058069344` is the matching machine-readable dialing target. Existing equivalent formatting was preserved under the no-wording-change constraint.
- Also scanned the public `/privacy-policy/` and `/thank-you/` pages and `/llms.txt`, `/ai-search-feed.json`, `/answers.json`, and `/ai-site-index.json` for contact and founding/experience claims.
- The shared `805 Commercial` mode-switch label is existing navigation/product branding, not an outdated company identity field. It was not renamed under the no-wording-change and protected-page rules. Actual company name/phone/email fields remain 805 Shutters/current contacts.

## Protected homepage and /shades/ findings

| Page | Finding | Action |
|---|---|---|
| `/` | Admin sign-in href `/api/crm/oauth/google?redirectTo=/crm/` returns 308 to `/api/crm/oauth/google/?redirectTo=%2Fcrm%2F`, then intentionally redirects 307 into OAuth | Unchanged. A later homepage-authorized fix could remove the initial slash-normalization hop; replacing the application sign-in endpoint with an external OAuth URL is not recommended. |
| `/` | Current phone uses the equivalent hyphenated format; shared `805 Commercial` mode-switch label; founding/experience claims listed below | Unchanged; no old phone/email found. |
| `/shades/` | No broken/redirecting content anchors; current phone uses the equivalent hyphenated format; shared mode-switch label and business JSON-LD year/experience claims | Unchanged; no old phone/email found. |

## Founding year and experience claims — report only

`founding-experience-claims.csv` lists every observed URL, field, and exact claim (347 occurrences across pages and feeds, including repeated shared JSON-LD). The public source contains `foundingDate: "1995"`, homepage source text `Family-owned since 1995`, and numerous `30 years` / `30+ years` experience claims. No 1986 claim was found in the scanned public marketing sources. No year or experience claim was changed or validated as true.

Key source locations: `src/lib/structured-data.ts` (foundingDate and business description), `src/lib/site-data.ts` (about/review/local-service/homepage data), `src/components/PageSections.tsx` (homepage and commercial copy), `src/components/AnswerPage.tsx`, `src/lib/llm-search-pages.ts`, `src/lib/ai-search-data.ts`, `src/app/llms.txt/route.ts`, `src/app/book-consultation/page.tsx`, and `src/app/window-treatment-comparison-guide/page.tsx`. Source-only homepage eyebrow text is not necessarily rendered by the specialized homepage layout; the CSV distinguishes claims actually present in HTTP responses.

## Regression protection

`scripts/public-site-integrity.test.mjs` starts the production build and crawls the current generated sitemap. It inspects actual HTML anchors without JavaScript, checks every sitemap URL's 200/self-canonical result, rejects redirecting or non-200 internal targets, and flags HTTP/non-www internal origins. It runs in GitHub CI after the build. Fixture checks prove that 301, 404, and HTTP/non-www anchors are detected.

The one explicitly documented exception is the exact existing homepage admin sign-in href. The exception does not apply to other pages or other API links. A broad redirect exemption would hide real regressions and is not used.

## Evidence files

- `sitemap-ledger.csv`: all 152 sitemap URLs, response statuses, canonical URLs, and keep decisions.
- `internal-anchor-ledger.csv`: every observed internal anchor occurrence and target's first response.
- `href-changes.csv`: header only because there are no eligible href fixes.
- `business-contact-ledger.csv`: phone/email occurrences in page text, JSON-LD, and feeds.
- `business-name-ledger.csv`: business-related name fields in structured data and feeds.
- `founding-experience-claims.csv`: report-only year and experience claims.

Preview comparison will be recorded in the PR description after deployment. This PR changes verification and reports only; no public page source, title, H1, meta description, city copy, sitemap, or AI-feed content is edited.
