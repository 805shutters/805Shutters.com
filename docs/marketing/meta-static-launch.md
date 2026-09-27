# 805 Shutters Meta launch preparation

Status: assets exported; browser/booking changes locally tested and deployed to preview. PageView verified on preview. CAPI implementation and successful preview booking verification remain blocked. No production release, migration, ad publication, or spend.

## Creative exports

Six selected originals are unchanged. JPG quality 85, embedded sRGB. Flattened source artwork has edge-to-edge text: exports preserve the full design with ivory padding instead of destructive square crops.

| File | Dimensions | Bytes |
|---|---|---:|
| ad-layered-shades-1x1.jpg | 1080 × 1080 | 210,531 |
| ad-layered-shades-4x5.jpg | 1080 × 1350 | 290,009 |
| ad-exterior-shades-1x1.jpg | 1080 × 1080 | 232,153 |
| ad-exterior-shades-4x5.jpg | 1080 × 1350 | 319,783 |
| ad-shutters-1x1.jpg | 1080 × 1080 | 153,992 |
| ad-shutters-4x5.jpg | 1080 × 1350 | 209,725 |
| ad-roman-shades-1x1.jpg | 1080 × 1080 | 203,838 |
| ad-roman-shades-4x5.jpg | 1080 × 1350 | 285,935 |
| ad-drapery-1x1.jpg | 1080 × 1080 | 200,724 |
| ad-drapery-4x5.jpg | 1080 × 1350 | 273,459 |
| ad-woven-shades-1x1.jpg | 1080 × 1080 | 236,805 |
| ad-woven-shades-4x5.jpg | 1080 × 1350 | 324,716 |

The same asset pair supports both Meta button variants. Book Now goes to `/book-consultation/` with UTMs. Call Now uses +1 805-806-9344 and does not produce a website Schedule conversion until a booking is actually completed.

## Implementation and release gates

- Browser event: Schedule, eventID = saved CRM lead ID. Public PageView uses a synchronous queue, including the booking route. Private CRM/API paths are excluded.
- Booking UTM parameters take precedence over older session attribution.
- Existing atomic booking_commit writes the lead, job, calendar entry, quote, request result, and notification outbox together. Missing lead ID fails closed; transaction failures emit sanitized codes.
- 24-hour duplicate guard compares normalized name + phone + address under the existing schedule row lock. Same-key retries return the original booking; new-key refreshes cannot create another lead.
- Apply `20260927194921_meta_booking_launch.sql` only to an isolated preview database. It has been exercised locally, not applied remotely.
- Preview requests targeting production Supabase evuxqsaucmvgyuvjpqlo are blocked.
- CAPI is pending explicit approval of its matching fields following automatic approval review rejection. The existing non-booking Lead helper has not been repurposed.
- Configure META_CAPI_ACCESS_TOKEN and META_CAPI_TEST_EVENT_CODE securely in Vercel Preview; do not put secret values in this document or source files.
- Connected Supabase branch access returns 403. An authorized account must provide the isolated preview branch and its Vercel preview configuration.

## Required hosted verification (not yet completed)

Load `/book-consultation/?utm_source=test&utm_medium=cpc&utm_campaign=verify&utm_content=meta-preview`, complete an unmistakably labeled test booking on an isolated preview database with all notifications disabled, and retain:

1. Browser PageView network evidence for dataset 117872572252906.
2. Browser Schedule eventID and accepted CAPI Schedule event_id, both equal to the saved lead ID.
3. Supabase lead row with four expected UTM values.
4. Duplicate request within 24 hours returning 409 and unchanged lead/job/calendar counts.
5. Same-key replay returning the same lead ID after an interrupted response.

Local automated tests are not a substitute for this hosted verification.

## Verification results — September 27, 2026

Preview deployment: https://805-qt1d57lb4-805-shutters.vercel.app

Booking URL tested: https://805-qt1d57lb4-805-shutters.vercel.app/book-consultation/?utm_source=test&utm_medium=cpc&utm_campaign=verify&utm_content=meta-preview

Deployed commit: 10ea167c (`codex/meta-static-launch`). Vercel deployment dpl_4mKapdo9zNdH66oT4CmGS1DXMAcY is READY, target preview. No push/merge to main and no production deployment or remote migration.

| Required check | Result | Evidence |
|---|---|---|
| Booking PageView | PASS | Browser request to www.facebook.com/tr/ with ev=PageView, id=117872572252906; HTTP 200. |
| Browser + CAPI Schedule, matching IDs | BLOCKED / NOT VERIFIED | No successful booking. CAPI matching-payload approval and secure Meta configuration pending. |
| Saved Supabase lead with UTMs | BLOCKED / NOT VERIFIED | Form submitted all four expected UTMs, but preview is still configured for production Supabase. The preview guard returned 503 before any database write. |
| 24-hour duplicate protection on preview | BLOCKED / NOT VERIFIED | No completed preview booking exists to replay. Local transaction and real Postgres race tests passed. |

Actual browser walkthrough: selected September 30 at 1 PM, entered synthetic test contact details and a public test address, selected Roman Shades, clicked Book appointment / No follow-up necessary. The visible result was “Preview booking requires an isolated preview database.” No success or conversion is claimed.

Local verification: 160 booking/tracking tests passed across 13 files; 8 opt-in concurrent tests ran separately and all passed in a temporary Postgres container. TypeScript check and local/Vercel builds passed. The shared SQL transaction, rollback on failed lead write, UTM persistence, same-key replay, different-key 24-hour protection, and simultaneous submissions were exercised locally.

Remaining intervention: approve the listed CAPI matching payload; configure META_CAPI_ACCESS_TOKEN and META_CAPI_TEST_EVENT_CODE in Vercel Preview; provide authorized isolated Supabase branch access and configure its URL/keys securely in Vercel Preview. Then apply the prepared migration to that branch, implement/verify CAPI, redeploy preview and repeat the real booking checks. Supabase branches isolate the schema from production data: https://supabase.com/docs/guides/deployment

Automatic approval review rejected both pulling production secrets into a local environment file and adding a CAPI payload containing hashed contact details, IP/user-agent, and tracking cookies without specific approval. Neither rejection was bypassed.
