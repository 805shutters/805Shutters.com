# SmartDrape standalone extra/replacement vane packs

Implemented, not yet deployed or verified in production.

Source: `norman-perfectsheer-smartdrape-guide-2026-09`, PS-SD Guide PDF page 24, text and rendered diagram inspected September 20. Fabric identities/categories reuse the August 11, 2026 PS-SD coordination source. September suggested retail PDF absolute page 24 / printed page 23 inspected for the unresolved price conflict.

The guide permits extra vane packs with a shade or separately on a new order. Standalone orders require the original WO#. It warns that later pattern availability and color-lot matching are not assured and expressly says standalone pricing differs. The September retail table instead says its $230/$270/$310/$350/$390/$460/$500/$540 six-vane prices (shade lengths 48/60/72/84/100/120/132/144) apply with a shade or on their own, with a 20% RD surcharge. This contradiction remains unresolved. No rate, dealer factor, freight, or selling-price assumption is activated.

New additive destination `norman_smartdrape_replacement_vanes`, program `_source`, product type Vane Packs, version `805-v2-norman-smartdrape-replacement-2026-09-20-r1`. Current shade and with-shade pack IDs, grids, snapshots, and policy are unchanged. Destination has no grid and always blocks automatic pricing/customer delivery through `manual_quote_required` plus an explicit source-price hold.

Typed version-1 request retains original WO#, requested finished vane length, pack style A/B, original single/side-by-side arrangement, original stack, single/alternating colors, and original vane count when needed. Quantity is packs of six. Opening dimensions are zero/not applicable. Requested finished length is preserved exactly, including fractional inches; neither a shade-height deduction nor a source-unsupported standalone size range is inferred. Length and original-order compatibility remain held for Norman confirmation.

Every color is selected from the existing coordination rows. Alternating colors must share LF, RD or LF Essentials category. This does not guarantee availability for an old work order. Older unlisted colors remain an explicit dealer-confirmation exception. Blank factory aliases remain blank in the reused source, never synthesized.

Composition reuses the with-shade six-vane count helper. Option B is six middle vanes (three of each for alternating). Single non-center-opening Option A is 1 first/4 middle/1 last. Center-opening A is 2/2/2. Side-by-side single-color A is 1/4/1; alternating A is 2/2/2. Alternating A's last color derives from the explicitly supplied original total vane count: odd first color, even second. Side-by-side supports only the guide's Left/Right/Traveling Center Stack rows.

Server validation rebuilds the source composition and requested quantities instead of trusting a browser-supplied derived record. Customer configuration formatting includes length, styles, colors, and pack composition; internal work-order identity and source records remain internal. The request form preserves unsaved edits across asynchronous stale server props and saves the complete typed request together.

Verification: 27 focused tests passed across replacement, with-shade packs, Roman ancillary, and customer design-detail paths. Coverage includes all source color pairs, six-vane conservation and source row variants, odd/even color, required WO, malformed requests, unsupported stack, exact fractional length, natural units, real builder routing, blocked authoritative result/no snapshot, serialization/reopen equivalence, rebuilt forged source record, rendered controls, and public field exclusions. Local typecheck reported only existing missing dependency modules (`@electric-sql/pglite`, Chromium/Puppeteer and pdf-lib) and dependent implicit-any errors; no changed-file errors.

Production gate remaining: parent full typecheck/tests/build/deploy, then internal native request save/close/reopen, original-WO and selected colors/length/composition persistence, customer-preview refusal, and a valid independent shade retaining its own price in a mixed quote. No sending or ordering is authorized by this verification task.
