# Common-valance At Gaps Between Shades

Sources inspected as text and rendered tables: SmartFold Guide page 16 (spacing page 18; common-width/gap page 14) and PerfectSheer/SmartDrape Guide pages 38–39. Source IDs remain the pinned September guides.

The named At Gaps mode applies to common-valance connectors and keystones. It requires exactly one joint per inter-shade gap (member count minus one). Complete selected group membership determines ordered shade widths and gaps. Zero-gap boundaries are derived; every positive gap requires an explicitly measured joint position inside that gap, from the finished valance left end. The system does not guess gap centers.

When finished valance width differs from the total shade/gap span, an explicit measured first-shade offset establishes the coordinate origin. No assumption is made about centering custom widths, inside deductions or returns. The saved versioned gap-placement record retains origin, intervals and positions, and is rebuilt from selected members.

Existing section limits and keystone spacing/count restrictions remain. SmartFold wide gaps still require an off-center split. PerfectSheer four/five-keystone configurations remain blocked by the guide's conflicting three-versus-five limits. Keystone charges remain on the common-valance owner once; connector selections do not create keystone charges. Existing Equal/Custom configurations retain their calculations and record shapes.

UI provides At Gaps only for common groups; positive-gap coordinate fields come from the saved server group. Every member must carry matching shared choices. Source-backed tests cover both families and joinery types, positive and zero gaps, origin offsets, invalid membership/counts, section limits, shared billing, serialization and retained source conflicts. Production proof is recorded below; configuration verification does not certify held retail or dealer pricing.

## Production verification — 2026-09-20

Internal unsent draft **805-0348**, customer **Norman At Gaps Internal Verification 2026-09-20**, was created through the native Norman quote workflow. SmartFold configuration began on deployed 8d2fa5c9 and was fully reloaded/reopened on the subsequently deployed SmartFold-r8 client (1d9abd98) to eliminate a concurrent catalog-version mismatch.

SmartFold Office lines 1 and 2: each 36 × 60 inches, quantity one, Outside Mount, Back / Wall Mount with Raceway, F1794 Ice White / Impressions, PrecisionLift Cordless, 7-inch fold, 6-inch Fabric valance, Square Keystone quantity one, At Gaps Between Shades, Valance 1, positions 1 and 2, gaps 4 and 0. Both explicitly store joint position **37.25 inches** from the finished valance left end, inside the measured **36–40-inch gap**. These selections persisted after a full browser reload and reopening quote 805-0348.

Negative production check: changing the first joint to **35.9375 inches** produced the saved server audit rejection “Joint 1 must fall at the measured boundary/gap after shade 1.” It was restored to 37.25 and saved. These common-valance configurations remain held by broader source/eligibility requirements; no approved retail price or all-in dealer cost is claimed. No quote was sent or marked sold, and no order was placed.

PerfectSheer Living Room lines 3 and 4 use 36 × 60 inches, quantity one, F1179 Lily Cream Light Filtering, Outside / Back Mount, Continuous Cord Loop with left/right outward controls, Modern Wood Valance in 003 Silk White, common group 1, positions 1/2, gaps 4/0, one Keystone and At Gaps joint position 37.25 on both members. The upper-bound negative check, 40.125 inches, produced the same measured-gap rejection in both the inline controls and the saved server audit. It was restored to 37.25 and saved. The Contract view refused customer output with “Pricing incomplete.”

After restoring both negative fixtures, closing the builder and reopening **805-0348** retained all four 36 × 60 dimensions, exact fabrics, separate family groups, positions 1/2, gaps 4/0 and all four measured joints at 37.25. PerfectSheer retained its Left and Right controls. No At Gaps inline geometry errors remained. This verifies persisted request choices and authoritative invalid-input rejection. The raw derived `gapPlacement` object is not exposed in the held-price staff UI, so database-level verification of that derived object is not claimed here.
