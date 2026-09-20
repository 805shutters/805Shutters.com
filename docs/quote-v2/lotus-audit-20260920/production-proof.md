# Lotus production CRM verification — September 20, 2026

Verified in authenticated Chrome on www.805shutters.com after release 9c53f89213bda098716eec2b5f6a15822b0f7c62. No quote was sent, signed, sold, paid or ordered.

## Native quote 805-0337

Customer label: **Lotus Native Catalog Verification 2026-09-20**. Created through the native quote entry, selected Lotus explicitly. Closed the builder, found the saved quote in Staff quotes, reopened it and read back every line. Internal notes say DO NOT SEND, SELL OR ORDER.

| Room | Program | Size | Color / mount | Reopened result |
|---|---|---|---|---|
| Office | AMX custom aluminum | 27 × 72 | White / inside | Configuration preserved; automatic pricing blocked |
| Living Room | FTXLG custom faux wood | 35 × 36 | Light Gray, smooth, 2-inch, one blind / inside | Configuration preserved; base $80.94 + existing $25 installation + $14 shipping = $119.94 |
| Family Room | RS 1% custom roller | 30 × 48 | Inside | Configuration preserved; automatic pricing blocked |
| Dining Room | CV steel complete vertical | 60 × 72 | Outside | Configuration preserved; automatic pricing blocked |
| Kitchen | MLX custom vinyl | 48 × 60 | White / inside | Configuration preserved; automatic pricing blocked |

The reopened quote showed four windows needing pricing. **Send Quote and Send Payment Link were disabled.** Contract view showed **Pricing incomplete: Complete pricing for every selected window before reviewing or sending the contract.** This is proof of saved selections and fail-closed customer delivery, not proof that all Lotus offerings have verified automatic pricing.

AMX, roller, vertical and vinyl still have restriction-source-incomplete status. The typed MLX regression separately verifies its guide dealer $21.74 / retail $65.22 staff arithmetic while enforcing the explicit dealer/portal price-conflict delivery issue. No manual override was entered.

## Legacy quote 805-0334

Customer label: **Lotus Catalog Verification 2026-09-20**. The ordinary New quote entry opened the older workflow. The same five configurations saved and reopened; the internal contract preview retained material, color where defined, mounting and dimensions. Prices including the unchanged $39 per-line installation/shipping policy were $117.90, $119.94, $144.06, $192.00 and $104.22, totaling $678.12.

These are arithmetic/persistence observations, not account-price approval. The legacy Send button did not expose the native authority gate. This discovered gap was fixed with server-side Lotus source-conflict preflight in commits 82af32d2 and 6631a9ab, subsequently deployed by the parent release. The preflight executes before a new quote is marked sold, before send-group contact/mirror writes, and at customer-mirror entry; signed contract terms and untyped legacy history remain intact. All native sibling provenance checks run before Lotus selection reads. No send was attempted.

## Dealer-listed destinations follow-up

The versioned observed-offering registry accounts for all 3,710 observed listing/variant rows: 820 custom listings, 2,728 stock rows and 162 parts rows. Six additive held destinations preserve all original 20 custom-program IDs. Two explicitly discontinued parts observations remain readable in the registry but are excluded from current selection. No observed listing price becomes a price grid. No manufacturer effective date is invented. Runtime selection and customer delivery remain held until configuration and price authority are resolved. Deployment and saved/reopened production proof of these new destinations are separate gates.

## Exact held destinations — deployed d28bd77d

In the same native verification quote 805-0337, added and selected the following current source identities, waited for Quote saved, closed the builder and reopened the quote:

| Room | Kind | Saved/reopened selection | Stable offering ID | Dealer source |
|---|---|---|---|---|
| Hall | Replacement part | FCXTILTER2JTS — 2 PC WAND TILTER 2 IN CORDLESS FAUX | lotus_observed_99928096bf5c0b2fae2d | https://www.lotusblind.com/products/2-pc-wand-tilter-2-in-cordless-faux |
| Foyer | Custom grid listing | CAMX2772W — Width Range 23.25–27 / Length Range 62–72 | lotus_observed_3788971af57298199b13 | https://www.lotusblind.com/products/camx2772w-width-range-23-25-27-length-range-62-72 |
| Breakfast Nook | Stock blind | AMX2772WH — 27 × 72 / White | lotus_observed_3d616264a894785908cd | https://www.lotusblind.com/products/amx-72-inch-length |

The exact three selected option values and labels survived reopening. Each showed Price confirmation required, a dealer source link, and Authoritative pricing blocked. Send Quote/Send Payment Link stayed disabled. No overrides were entered. Dimensions were not invented for these identity-only held records.

This verification exposed an existing server batch failure: zero width on one draft line threw “Authoritative V2 pricing could not interpret the saved selection: width: must be greater than zero” after structural mutation had invalidated all mutable prices. Thus the previously priced FTXLG line was cleared to zero despite unchanged valid selections. The immutable history remains intact. Fix 1b021940 makes the server retain legitimate draft zeros for per-line validation, leaves malformed fractions/quantities rejected, and represents parts by item/quantity. Regression testing proves valid FTXLG35×36 retains119.94 while a dimensionless part and unfinished shade remain held. Production re-verification passed after 04d74891 and fed42ad5, as recorded below.


## Final mixed-draft and AMX customer-preview proof — fed42ad5

Verified on www.805shutters.com after parent confirmed deployment https://805-eh53yrg9p-805-shutters.vercel.app. Full browser reload, Staff quotes, and reopening 805-0337 retained all eight lines and exact identities. The completed live results are:

| Room | Saved result after reload |
|---|---|
| Office | Typed AMX 27 × 72, White, Inside Mount, Cordless, no valance: **$117.90** |
| Living Room | FTXLG 35 × 36, Light Gray, Inside Mount, 2-inch smooth, one blind: **$119.94** |
| Family Room | Typed RS 1%, White, cordless spring, Smooth valance, Inside Mount, Semi-inside, **2-inch recess**: held at zero |
| Dining Room | CV steel complete, 60 × 72, Outside Mount: held at zero |
| Kitchen | MLX 48 × 60 White, Inside Mount: held at zero |
| Hall | Exact FCXTILTER2JTS part ID above, **By item / quantity**, quantity 1, no invented dimensions: held at zero |
| Foyer | Exact CAMX2772W custom-listing ID above, incomplete measurements: held at zero |
| Breakfast Nook | Exact AMX2772WH stock ID above, incomplete measurements: held at zero |

The builder displayed **Quote saved**, **6 windows need pricing**, and disabled Send Quote/Send Payment Link. Contract view still displayed Pricing incomplete and refused customer output for this mixed quote. The valid AMX and FTX prices did not disappear when the incomplete siblings were repriced. All three held offering IDs were read from the selected controls after reload and matched the recorded identities.

The AMX staff audit showed base retail $78.90, final per window $117.90, dealer merchandise base $26.30, source page 97, the pinned West A26.v1 hash, Effective date **Not supplied by manufacturer**, and Ledger status **Customer retail saved; dealer landed cost is separate**. Wholesale add-ons remain unresolved, and **Landed cost unresolved — margin withheld** remains explicit. The $26.30 is not total dealer landed cost.

### Standalone native quote 805-0339

Created through New Norman quote, then explicitly selected Lotus Aluminum Mini Blinds. Customer label **Lotus AMX Pricing Verification 2026-09-20**, with no contact details. Internal note: **INTERNAL AMX PRODUCTION VERIFICATION — DO NOT SEND, SELL OR ORDER. Customer retail follows existing 3x source merchandise policy; dealer freight and order surcharges remain unresolved.**

Configured Office, 27 × 72, White, Inside Mount, Cordless, no valance, quantity 1. Waited for Quote saved and observed **$117.90**. Contract preview showed the exact program, White, Inside Mount, Cordless, dimensions, $25 installation, $14 shipping, and subtotal/total **$117.90**. Then performed a full browser reload, found quote 805-0339 in Staff quotes with Draft / $117.90, reopened it, and reread the same selections and price. Reopened Contract preview retained them again.

This proves the representative customer retail configuration and production persistence. It does not certify all AMX boundary/color combinations, current source-book effective date, live stock or dealer order charges. No send, share, signature, sale, deposit, order or checkout action occurred. The new-line initialization required one explicit program reselection; repair 327ccd13 addresses that usability defect separately, without changing historical records.

### New AMX initialization and persistence — b907fd2e / e1b9ccaa

After initialization repair 327ccd13 reached production, added Primary Bedroom as line 9 to internal quote 805-0337. Selecting Lotus Aluminum Mini Blinds initialized the current typed program immediately; no program reselection was needed. Entered 27 × 72, White, Inside Mount, and waited for Quote saved after edits. The line priced at $117.90 while the original Office AMX retained $117.90, Living Room FTXLG retained $119.94, and the six incomplete or held lines remained blocked.

A full browser reload, Staff quotes, and reopening 805-0337 retained Primary Bedroom's exact program, 27 × 72, White, Inside Mount, quantity 1 and $117.90. The quote still showed six windows needing pricing. This verifies the new-line initialization through saved production state; it does not broaden the representative AMX pricing evidence to other sizes or colors.


### Typed vertical and customer measurement wording — 1acd1e85

On verified deployment https://805-hv09cf5nd-805-shutters.vercel.app / www.805shutters.com, upgraded internal 805-0337 Dining Room to the current typed steel complete vertical configuration. Recorded 60 × 72, White, Left stack and optional 48-inch White wand; matching valance and White steel headrail are program-derived. Each edit reached Quote saved. A full browser reload retained the program, color, stack and accessory selections. Program reselection intentionally clears mounting, so completed Outside Mount explicitly, waited for Quote saved, then closed and reopened the quote. The final readback retained all these selections, quantity 1 and the unchanged dimensions. The vertical remained $0.00 / Authoritative pricing blocked.

Office AMX $117.90, Living Room FTXLG $119.94 and Primary Bedroom AMX $117.90 remained intact, with six windows needing pricing. Send Quote and Send Payment Link stayed disabled. Contract still refused output with Pricing incomplete. The optional wand is captured as a source-supported selection, not a verified charge. Current custom authority, cut feasibility and accessory charges remain unresolved. This is representative steel-program persistence proof, not complete vertical-family pricing certification.

After a full reload and reopening standalone 805-0339, its customer Contract preview retained $117.90 and displayed **Measurements: Inside opening; manufacturer deducts ½ inch from width**. It no longer exposes the internal `inside_opening` value. No customer delivery or order action occurred.
