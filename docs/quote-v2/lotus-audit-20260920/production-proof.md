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


### Aluminum one-way complete vertical — 1acd1e85

Added Primary Bathroom as line 10 to internal 805-0337, explicitly selected the aluminum one-way complete program, then saved 60 × 72, White, Outside Mount and Right stack. The program retained its standard 30-inch wand, White headrail and matching valance. After Quote saved, closed and reopened the quote from Staff quotes. All selections, dimensions, quantity 1 and the exact program remained, with the line held at $0.00 and seven windows needing pricing. This closes individual persistence proof for the second of seven imported vertical programs.

The remaining headrail and vane component proofs require single-axis measurements. Repair 2f55345a adds a width-only headrail form and length-only vane form, leaves the irrelevant axis zero, and preserves all existing pricing holds. Its production proof completed on 418226b6, as recorded below.


### Aluminum center-draw complete vertical — 138be0b3

After the parent confirmed 138be0b3 live (including the null-valance adapter correction), configured Bedroom 3 as line 14 in internal 805-0337. Saved 60 × 72, White, Outside Mount, center draw and the standard 30-inch wand. Valance inclusion remained explicitly unresolved. After Quote saved, closed and reopened the quote. The exact program, dimensions, color, mount, center draw, wand and unresolved valance statement remained, with $0.00 / pricing held. Three headrail programs and the vane program were also saved as distinct identities but had no invented dimensions while their natural-axis form awaited release.


### Four component programs and natural measurement axes — 418226b6

On www.805shutters.com after the verified 418226b6 release, completed the remaining four component programs in internal quote 805-0337. The measurement dialog asked only for Headrail width on headrails and Vane length on vanes. No irrelevant dimension was fabricated.

| Line / room | Persisted source configuration |
| --- | --- |
| 11 Bedroom 1 | Steel headrail; width 60 only; White; Outside Mount; Left stack; standard 30-inch wand; no valance |
| 12 Bedroom 2 | Aluminum one-way headrail; width 48 only; White; Outside Mount; Right stack; standard 30-inch wand; no valance |
| 13 Guest Room | Aluminum center-draw headrail; width 72 only; White; Outside Mount; Center draw; standard 30-inch wand; no valance |
| 15 Nursery | Vanes only; length 48 only; Alabaster; quantity 1; no headrail, mounting, stack or control; no valance |

After Quote saved, closed the builder and reopened 805-0337 from Staff quotes. Read back each exact program, measurement label and selected option. All four remained held at $0.00, with the vane per-piece/carton quantity basis explicitly unresolved. Center-draw complete line 14 also retained its distinct identity and unresolved valance inclusion. All seven imported vertical programs now have individual production save/reopen evidence; this proves persistence and source-backed selection rules, not verified current pricing.

The mixed quote retained Office AMX $117.90, Living Room FTXLG $119.94 and Primary Bedroom AMX $117.90. Twelve held or incomplete lines remained blocked. Contract refused customer output with Pricing incomplete. No send, sell, signature, payment or order action occurred.

## MLX/RLX physical cut schedule increment — deployment/live proof pending

Current dealer-linked Digital Catalog V1.1.25 pp8–11/34 and the linked order guide p1 support typed 1-inch vinyl inside-opening, cordless, no-valance configurations. MLX and RLX now use separate exact stock-program/color donors. Donors at/below22 inches cannot be width-cut; larger donors permit up to6 inches removed, with minimum½ for MLX and¼ for RLX. Custom widths use¼-inch increments, heights whole inches. The specific product pages/order guide limit height removal to10; the general p34 twelve-inch wording remains a conflict above10. Donors cannot exceed the dimensions of the selected custom price cell. The record never substitutes the stock price for the custom grid or claims inventory.

New/reselected programs receive an additive `lotus-vinyl-v1` contract. Earlier selections and earlier catalog dates retain historical behavior. The visible mount menu follows the bounded inside-opening route, the UI shows exact physical donor candidates, and server validation independently rejects incompatible dimensions, controls, mounts and forged program identity. Native save testing verifies donor SKUs in the protected validation snapshot while the authoritative price snapshot is null and delivery remains blocked. Legacy delivery cannot bypass the typed contract. Existing MLX/RLX portal-price contradictions are unchanged.

Forty-nine focused tests pass across rule/UI/native adapter/legacy delivery/server price-save suites. The actual server-save test confirms MLX4860WH is retained as protected validation evidence. Local changed-file typecheck is clean; unrelated missing DB/PDF dependencies remain in this isolated clone. Deployment and real CRM save/reopen proof are pending. RTX maximum width-cut authority, faux-wood donor constraints and parts compatibility remain separate follow-up branches.
