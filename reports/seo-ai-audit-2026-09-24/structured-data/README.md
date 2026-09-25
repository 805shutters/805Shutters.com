# 805 Shutters JSON-LD audit — 2026-09-25

Scope: all 152 URLs in the live sitemap at production commit `7f2f3022ff3f6d2045bdfd03e474aefbee4287c9`. Direct HTTP GET captured initial HTML, without browser JavaScript. All pages returned 200. All 292 JSON-LD script blocks parsed. This is a source-backed audit and automated field validation, not a claimed Google Rich Results Test or Search Console result. No Google account was accessed.

## Round 2 supersedes the protected-page exceptions below

The user approved the same schema corrections on / and /shades/. All 152 sitemap pages now receive the corrected business entity. See [round 2 validation and before/after](ROUND2.md), [outside-county wording proposals](OUTSIDE-COUNTY-PROPOSALS.md), and [unchanged claims pending decisions](UNVERIFIED-CLAIMS.md). The original audit below is retained as baseline history; its 150-page scope and protected-page suggestions describe round 1, not the current PR.

## Evidence

- [Schema types and every page containing them](schema-type-pages.csv): includes nested types, not just graph roots.
- [Every identified issue by page and JSON path](findings.csv), plus [Schema.org vocabulary range checks](vocabulary-findings.csv).
- [Geographic references, including protected pages and approved Westlake Village](geography-flags.csv).
- [Existing founding, founder/owner, price and hours claims](existing-claims.csv).
- [Review/rating findings](review-rating-flags.csv): zero rows; no Review, AggregateRating, review or aggregateRating markup found.
- [Captured production payloads](production-jsonld.json) and [summary counts](audit-summary.json).

## Results by type and applicable requirements

Counts are pages, not node totals. Detailed page membership is in schema-type-pages.csv.

| Type(s) | Pages | Audit result / applicable guidance |
| --- | ---: | --- |
| HomeAndConstructionBusiness, LocalBusiness | 152 each | Business name and email already correct. Phone digits correct but country code absent; URL lacks requested terminal slash. No address or geo. Google requires address for LocalBusiness rich results and recommends geo when applicable. Keep both absent under the service-area/no-street-address instruction; areaServed does not replace Google's address requirement. Image, logo, telephone, URL, hours and priceRange are present; existing hours/price are not verified by this task. |
| Organization | 1 (/official/) | No Google-required properties. Existing name, telephone, email, URL and logo are present, but this is a second partial definition of the same business ID, with a different logo URL. Replace with a reference to the complete shared business entity. Organization recommendations are relevant to LocalBusiness as its subtype, without requiring a separate Organization node. Do not invent legal identifiers, staff counts, address or tax data. |
| WebSite | 152 | name and url are present; publisher points to the business. Google's site-name feature uses the homepage; repeated WebSite nodes on other pages are not extra site-name opportunities. No missing site-name required fields. |
| BreadcrumbList | 139 | All have at least two ListItems; all required names, integer positions and nonfinal item URLs present. Missing breadcrumbs on other pages are not automatically errors. |
| FAQPage, Question, Answer | 37 each | Question names and acceptedAnswer.text present. FAQ rich results were retired in May 2026. Keep existing markup; do not claim FAQ rich-result eligibility or fill fictional answers. Semantic relevance/visibility remains a general structured-data requirement, not guaranteed by successful parsing. |
| Service | 152 | No dedicated Google Service rich-result feature or universal Google required-field checklist. Page services include provider references. Broad coverage repeats the unapproved service region. Partial business providers duplicate fields; consolidate references. |
| Offer, OfferCatalog | 152 each | Nested service offerings are not Product merchant-listing markup. Do not require or invent retail product prices, reviews or stock data. Business makesOffer currently contains plain strings where Schema.org expects Offer objects; fix structure using the existing service names. Existing free-consultation price 0 is retained, not newly asserted. |
| ServiceChannel | 14 | servicePhone is plain text; Schema.org expects ContactPoint. Correct its type and approved telephone. No Google-specific rich-result requirements. |
| WebPage | 138 | Generic page entity, no standalone Google rich-result required fields. Existing name, URL, descriptions and relationships retained. |
| CollectionPage | 1 | Generic page subtype, not a standalone rich-result feature. No Google-specific required gaps identified. |
| ImageObject | 135 | Image URLs present; Google rich-result-specific image recommendations are conditional on the supported feature. No fabricated dimensions, rights or attribution. Image licensing markup is not asserted. |
| ItemList | 15 | Existing ordered options retained. A service comparison list is not automatically an eligible Google carousel. No invented carousel-required product data. |
| ListItem | 139 | Breadcrumb-specific requirements checked above; service list entries retain positions and items. |
| HowTo, HowToStep, HowToSupply | 14 each | Process name, steps and step text present. HowTo rich results are retired; no current Google enhancement to repair. Generic Schema.org markup retained. |
| ContactPoint | 152 | Telephone, email and contactType present. Normalize the business telephone and area; do not invent alternative contacts/languages. |
| OpeningHoursSpecification | 152 | dayOfWeek, opens and closes present and syntactically plausible. Existing Monday–Saturday 08:00–18:00 requires business confirmation; unchanged. |
| AdministrativeArea, City | 152 each | Broader region and Santa Clarita propagate globally. Correct company-wide coverage to county plus approved 14 areas. Use Place for the mixed list of cities/unincorporated communities; do not assert all are incorporated cities. |
| BusinessAudience | 15 | Descriptive audience node; no standalone Google required fields. Existing audienceType retained. |
| PeopleAudience | 14 | Same: no standalone Google required fields. |
| Brand | 14 | Existing name present; not a separate business identity. No Google-specific gaps. |
| Person | 152 | Existing founder/owner Ken Hill references, not ProfilePage rich-result markup. Facts need confirmation but are not changed here. |
| PropertyValue | 152 | Google Maps CID identifier present; no standalone Google rich-result required fields. |
| ReserveAction, EntryPoint | 152 each | Existing consultation action names and target URLs present. Not proof of Google booking integration; no new action or booking capability claimed. |
| CommunicateAction | 1 | Existing consultation action; no Google-specific required fields. |

## Business consistency and geographic flags

All 152 complete business definitions already share `https://www.805shutters.com#local-business`, name `805 Shutters`, email `805@805shutters.com` and foundingDate `1995`. Preserve this established ID. There are 136 additional named partial definitions (135 providers and the Organization on /official/); use ID references on editable pages instead of duplicating identity fields.

The 15-entry company-wide areaServed contains all 14 requested areas plus Santa Clarita, but no explicit Ventura County entry. serviceArea says `Ventura County, North Los Angeles County, and Santa Clarita`. These inherited outside-county references occur on all 152 pages. The Facebook and Yelp URLs already match. Instagram's trailing slash and the Maps host/query spelling differ from the requested exact values; these are URL normalization differences, not evidence of different businesses.

Westlake Village is explicitly approved and stays. Its incorporated city is in Los Angeles County; the greater area also includes Ventura County neighborhoods. Do not claim every named place is wholly within Ventura County or add false containedInPlace relationships. See the [city's explanation](https://wlv.org/ArchiveCenter/ViewFile/Item/2720).

Seven pages contain Santa Clarita-specific page schema and stay flagged for a later content/service-scope decision:

- /shutters/santa-clarita/
- /shades/santa-clarita-ca/
- /blinds/santa-clarita-ca/
- /drapery/santa-clarita-ca/
- /window-coverings/santa-clarita-ca/
- /window-treatments/santa-clarita-ca/
- /commercial-window-coverings/santa-clarita-ca/

Page titles, descriptions, FAQ wording, and the commercial page's city-specific areaServed are retained. A schema-only patch cannot honestly make those pages Ventura-County-only while their content still targets Santa Clarita. Full field-level occurrences are in geography-flags.csv.

## Exactly what this PR changes

On 150 editable sitemap pages, with no change to the homepage or /shades/:

1. Shared business telephone and contactPoint.telephone → `+1-805-806-9344`; business URL → `https://www.805shutters.com/`. Name and email remain their already-correct values. Founding date remains 1995.
2. Company-wide areaServed and contactPoint.areaServed → Ventura County plus the 14 approved areas; serviceArea → Ventura County. Broad nested service coverage gets the same correction. Specific city-service coverage stays specific.
3. sameAs uses the four exact approved URLs; replace the equivalent Instagram and Maps variants and normalize hasMap. Existing extra directory URLs stay, pending separate verification.
4. Named partial business definitions become references to the same established @id. One complete business entity remains per editable page.
5. makesOffer strings become Offer objects containing Service objects, preserving existing service names and adding no prices.
6. On 14 answer pages, ServiceChannel.servicePhone becomes a ContactPoint containing the approved number.

The shared layout uses a small pathname-aware script renderer, rendered into the initial server HTML, to preserve the original JSON-LD on / and /shades/ and on nonsitemap routes. Corrected and original payloads are prepared on the server. Page-specific serializers use the same schema-only normalization. Shared visible site/brand data is not edited. No page, sitemap entry, title, H1, metadata, visible wording, link, review, or rating is removed or changed.

## Protected-page suggestions (not applied)

Both / and /shades/ need the shared phone/URL/profile/coverage/makesOffer corrections above. /shades/ also repeats partial provider fields and broad service coverage. They retain the old schema exactly for this PR, including outside-county coverage. Approve a later schema-only update to make all 152 pages consistent. No address, geo, price, rating or hours should be fabricated to satisfy a test.

## Gaps / unresolved facts

- No street address or geo: deliberate; not eligible for Google's address-required LocalBusiness treatment on that basis.
- Existing priceRange `$$`, Monday–Saturday 08:00–18:00, founder/owner `Ken Hill`, free consultation offers, extra directory sameAs links and experience prose are retained, not newly verified. See existing-claims.csv.
- No review/rating markup found. Google's self-serving LocalBusiness/Organization reviews are ineligible for review stars; that does not mean every such occurrence automatically causes a penalty. General misleading-markup rules still apply.
- Automated parse/field tests do not certify Google eligibility, visual answer correspondence, indexing, rankings, or third-party entity ownership.

## Sources checked 2026-09-25

- [Google LocalBusiness requirements](https://developers.google.com/search/docs/appearance/structured-data/local-business)
- [Google Organization recommendations](https://developers.google.com/search/docs/appearance/structured-data/organization)
- [Google breadcrumb requirements](https://developers.google.com/search/docs/appearance/structured-data/breadcrumb)
- [Google site names](https://developers.google.com/search/docs/appearance/site-names)
- [Google supported structured-data features](https://developers.google.com/search/docs/appearance/structured-data/search-gallery)
- [Google updates: FAQ retirement](https://developers.google.com/search/updates)
- [Google review policy](https://developers.google.com/search/docs/appearance/structured-data/review-snippet)
- [Google general structured-data policies](https://developers.google.com/search/docs/appearance/structured-data/sd-policies)
- [Schema.org makesOffer range](https://schema.org/makesOffer), [servicePhone range](https://schema.org/servicePhone)

See [completed preview validation and before/after example](VALIDATION.md). Remaining Santa Clarita/Los Angeles wording appears on 11 pages, including the protected pair, seven city pages and both consultation pages; see validation for the precise list.
