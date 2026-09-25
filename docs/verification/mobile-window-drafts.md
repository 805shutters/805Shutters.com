# Unfinished mobile windows — local verification

Implemented on `codex/mobile-window-drafts`, based on freshly fetched `origin/main` at `5dd7f8ba`. The canonical checkout and its unrelated changes are untouched. Publishing was explicitly excluded from this task.

## Behavior

- The existing mobile workflow accepts positive width/height in sixteenths, with optional photos and optional room/product details. Save window & next commits the working draft to IndexedDB before advancing.
- Save draft quote freezes and checkpoints the request before using the existing authenticated create, structure, and photo APIs. Unnamed lines receive Window 1, Window 2, etc.; an untouched final placeholder is omitted. Explicit manual prices use the existing line-price API.
- A blank product is represented by the explicit empty string on a line and a null selected design; no design is created until a product is assigned. Configuration changes continue to invalidate pricing and require the expected revision.
- Retries use the same quote, line, design, photo, and request identities. A failed local recovery checkpoint prevents external saving, including on retry. Upload failures retain the photo blobs on the originating device and show a pending status. Success requires all lines and photos to finish saving.
- The shared builder shows measurements, private authenticated photo thumbnails, and incomplete selections. Product assignment edits the original line. The staff contract draft lists unfinished windows with Not priced. Existing customer delivery, signing, accepted-selection, and historical-price protections are retained.

## Evidence boundaries

| Requirement | Verification |
| --- | --- |
| Multiple unnamed windows, fractional dimensions, optional photos, empty trailing window | Save-orchestration tests and real mobile component in Chromium |
| Offline/pending status, interrupted uploads, reload/retry, duplicate taps | Chromium with independent IndexedDB and a fault-injected local API fixture |
| Reopen from another device | Independent authenticated **test** browser context reading shared fixture backend; no original IndexedDB access |
| Photo bytes and window association | Real image compression, Blob persistence, multipart upload and displayed images in the browser fixture; existing photo API storage/retry tests |
| Product assignment retains line identity, dimensions and photo | Real builder action in Chromium plus actual structural RPC executed in PGlite |
| Draft-only database relaxation and revision conflict | PGlite executes the checked-in structural RPC, soft-archive migration, active-line filter migration, then the new migration |
| API response with null selected design and shared quote route | API/route-resolver regression tests |
| Mixed completed/incomplete lines and pending contract prices | Save/completeness regression tests and staff contract preview in Chromium |
| Sending/signing and historical protection | Existing regression suite; unfinished staff preview contains no send/sign actions |
| Phone/iPad/desktop presentation | Reviewed screenshots at 390×844, 820×1180, and 1440×1000; viewport simulation, not physical-device certification |

Browser fixture: `e2e/mobile-window-drafts.local.spec.ts`. It renders the production mobile editor, quote builder and contract components and intercepts every backend request with test data. The fixture deliberately rejects external requests. Its synthetic authentication does not establish production authentication/RLS or cross-device behavior in production.

## Check results

- Full Vitest regression run: 714 files passed, 5 skipped; 9,077 tests passed, 28 skipped. A prior concurrent build/test run exceeded an existing five-second catalog-test limit; the standalone full run passed without increasing timeouts.
- Final database-invariant check: all 4 PGlite tests passed, including rejecting designs on unassigned windows.
- Final contract/acceptance/completeness checks: all 32 tests passed. The mixed preview uses the existing selected-design line-total calculation, including quantity and once-per-line charges.
- Final Chromium flow: passed, including a completed alternative alongside an unfinished window, with no uncaught page errors.
- Typecheck and production build: passed. Next reports the existing multiple-lockfile workspace-root warning.
- Diff whitespace check: passed.

## Reproduce

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run typecheck
npm test
npm run build
npx vite --config e2e/mobile-window-drafts.vite.mjs
# In another terminal:
E2E_BASE_URL=http://127.0.0.1:4281 npx playwright test e2e/mobile-window-drafts.local.spec.ts
```

If Playwright Chromium is not installed, set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to an installed Chrome executable. Screenshots are written to `test-results/window-draft-{phone-review,ipad-builder,desktop-contract}.png`.

## Release state

Not pushed or deployed. The migration `20260925010000_quote_v2_measurement_only_drafts.sql` is tested locally but **not applied to production**. It must accompany the frontend/API release; the old RPC rejects unassigned products. The migration fails explicitly if the expected installed function blocks differ.

After separately authorized publishing, verify the actual authenticated `/crm/mobile/quotes` flow on one device, reopen its shared quote through `/crm/quote/<id>/` on a second authenticated device, confirm each image and fraction, and finish a product selection without changing its line identity. Also verify the authenticated `/crm` iPad redirect and customer sending/signing rejection for incomplete selections. No production customer quotes or messages were created during this implementation.
