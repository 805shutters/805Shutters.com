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

This verification exposed an existing server batch failure: zero width on one draft line threw “Authoritative V2 pricing could not interpret the saved selection: width: must be greater than zero” after structural mutation had invalidated all mutable prices. Thus the previously priced FTXLG line was cleared to zero despite unchanged valid selections. The immutable history remains intact. Fix 1b021940 makes the server retain legitimate draft zeros for per-line validation, leaves malformed fractions/quantities rejected, and represents parts by item/quantity. Regression testing proves valid FTXLG35×36 retains119.94 while a dimensionless part and unfinished shade remain held. Production re-verification is pending the repair deployment.
