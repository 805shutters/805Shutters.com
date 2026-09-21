# Quote pricing and line controls — 2026-09-21

## Requested behavior

The quote collects grid identity, billable dimensions and priced options. Installation/order-readiness evidence is not required for price lookup. Blind/shade installation stays $25 per physical unit, with the existing $14 shipping policy and discount rules. Missing real prices stay explicit; staff can set a custom merchandise price, including zero, and delete any line. Sent/signed records are preserved and either edit opens a separate draft revision.

## Product review

- Norman: all 14 core families, all six shutter pricing programs, ancillary and held catalog destinations reviewed. See `../outputs/quote-grid-recovery-20260921/norman-pricing-only-rule-audit.md`.
- Other manufacturers: 62 catalog products (9 Onyx, 13 Polar, 11 Lotus, 29 Sundance). See `non-norman-pricing-only-review-20260921.md`.
- Audited installation-only controls and validation are omitted from quoting. Actual fabric/program identity, grid boundaries, purchased quantities and unpriced exceptions remain explicit.
- This is a pricing-only behavior review with representative price regressions. It does not certify every supplier portal permutation or resolve missing account-specific price schedules.

## Live customer checks

### Jon Loring — 805-0367

| Active line | Base/fabric grid | Priced option | Installation/shipping | Quantity | Line total |
|---|---:|---:|---:|---:|---:|
| Bedroom 1 Roman 91 × 48 | $2,008 (96 × 48 PG2 cell) | Included cordless | $39 | 1 | $2,047 |
| Dining Room Onyx 92 × 71 | $1,550 | $40 H3 tilt, four panels | $0 | 1 | $1,590 |
| Office Onyx 69 × 71 | $1,209 each | $20 H3 tilt each | $0 | 2 | $2,458 |
| Bedroom 2 Onyx 69 × 71 | $1,209 | $20 H3 tilt | $0 | 1 | $1,229 |
| Living Room custom panel-track quote | $3,750 staff merchandise amount | Preserved | $39 | 1 | $3,789 |

Saved revision 126 and customer preview both show **$11,113**, excluding the previously deleted $1,229 line. Roman base resolves to $1,662 PG1 + $346 fabric upgrade. Existing manual amount and panel-track description preserved.

### Max Spiegelman — 805-0366

Three motorized NA400 Roller lines automatically recovered: 101 × 88 at $1,462; 72 × 88 at $1,211 each, quantity two; 99 × 85 at $1,462. Their base cells are $941 / $690 / $941, plus $482 motor and $39 installation/shipping per shade. Saved revision 142 and customer preview show **$10,311**.

## Internal production checks

805-0387: calculator saved 36 1/2 × 60 1/4; CityLights grid price $321 + $25 + $14 = $360. Custom merchandise $400 saved as $439 each; quantity two saved and previewed as $878. Deleting the priced line persisted after close/reopen, with immutable historical snapshots retained.

## Remaining source exceptions

Account-specific and absent source prices remain explicit (including provisional Norman shutter dealer-cost schedules and the catalog holds listed in manufacturer ledgers). No dealer factor or selling-price policy was silently changed. Customer prices are not fabricated to remove a warning.

## Final production verification

Application release `0484c395` deployed to `https://www.805shutters.com` with 8,276 tests passing (28 skipped), successful typecheck and production build. The real sent-quote check exposed the legacy browser-only quote-number allocator; follow-up migration `20260921233000_fix_revision_service_number_allocation.sql` corrects only the authenticated revision function's allocator. Its 21 database tests include the actual authentication helper and frozen-quote triggers; migration applied and live retested successfully.

- 805-0387: added a Roman line with no size, fabric or program. Explicit $0 merchandise override saved as $39 including the unchanged $25 installation/$14 shipping. The line then deleted successfully; saved active-line count is zero and total is zero, with historical records archived.
- Sent 805-0386: $125 merchandise edit created separate draft 805-0388 at $164. The new draft reopened at $164 and contract view showed $125 in the editor, avoiding a second installation/shipping addition. Deleting from contract view saved zero active lines and zero total.
- Sent 805-0386: deleting its line created separate empty draft 805-0389. The original remains Sent, one active line, $39. The original quote, line and design hashes were unchanged after the price revision.
- Jon 805-0367: after deployment, five active lines displayed $2,047; $1,590; $1,229 × 2; $1,229; and $3,789. Builder and saved contract preview both show $11,113. No mounting-depth input or internal manual-price policy metadata appears in the checked quote/output.
- Signed/accepted subset and quantity behavior is covered by database and rendered UI regressions; no real customer's signed contract was changed during verification. No customer quote was sent and no order or payment was placed.
