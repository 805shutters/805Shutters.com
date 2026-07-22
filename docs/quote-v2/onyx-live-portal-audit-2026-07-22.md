# Onyx U.S. Made Vinyl — live portal parity audit

Date: 2026-07-22  
Status: **FAIL CLOSED — pricing-source conflict**  
Portal draft: customer-neutral `CODEX PRICING TEST - DO NOT ORDER`; not checked out or submitted

## Exact configuration

- Manufacturer: Onyx Shutters
- Portal program: U.S. Made Shutters
- Material: Vinyl
- Shape: Regular
- Opening size: 30 × 72 inches
- Frame: VL Outside, four sides
- Louver: 3 1/2 inches
- Color: 101 White
- Panel configuration: L
- Quantity: 1
- Portal billable area: 17.564 sq. ft.
- Portal surcharge: $0.00

## Before-correction result

| Comparison | Onyx portal | 805 before | Difference | Result |
|---|---:|---:|---:|---|
| Dealer base cost | $239.75 | $204.00 | -$35.75 / -14.91% | Fail |
| Customer MSRP | Not provided | Blocked | Not comparable | Correctly blocked |

The pre-audit internal catalog calculation used the 30 × 72 opening area
(`15.000 sq. ft.`) and the supplied `$13.60/sq. ft.` screenshot, producing
`$204.00`. The authenticated portal instead returned a raw line price of
`$239.749`, displayed as `$239.75`, with no surcharge.

## Exact discrepancy

The portal result proves two facts for this exact fixture:

1. `17.564 × $13.65 = $239.7486`, which reconciles exactly to the raw portal
   line price of `$239.749`.
2. The portal's `17.564 sq. ft.` billing area is not the `15.000 sq. ft.`
   opening area used by the old internal calculation.

`33.5 × 75.5 / 144 = 17.564236...`, so the portal area is consistent with a
3.5-inch total allowance in both dimensions for this VL Outside frame. That is
an inference from the observed result, not sufficient evidence for a general
frame-pricing rule.

## After-correction behavior

V2 now emits `onyx.price.portal_source_conflict` as a hard block for U.S. Made
Vinyl. It retains the old `$13.60` screenshot and the new `$13.65` portal
fixture as separate immutable evidence instead of silently choosing one.

- 805 customer retail after correction: `$0.00` / unavailable
- Sendable: no
- Internal current-price claim: withheld
- Manufacturer MSRP comparison: unavailable because the portal exposes dealer
  cost, not manufacturer MSRP

This is intentionally not a hard-coded `$35.75` adjustment. Onyx must confirm
the active material rate and the frame-specific billable-area formula before
the product can be promoted from `restriction_source_incomplete`.

## Evidence

- Source ID: `onyx-us-made-vinyl-portal-2026-07-22`
- External source-vault file: `Onyx US Made Vinyl Portal 2026-07-22.png`
- SHA-256: `8396fc5fadef32982a5731ce007e2b41d133de038f769d00ac44681f037f7eaf`
- Byte length: `73,462`
- Retained image is cropped to the configured line and totals; account identity
  and customer information are not present.

