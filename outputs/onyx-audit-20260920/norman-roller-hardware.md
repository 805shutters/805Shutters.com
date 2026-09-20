# Roller standard installation hardware — September 20 increment

Sources: `Roller Shade Guide 2026-09-16.pdf`, SHA256 `81114d0186dff48a54848d315059f52330ee506e589a49a5e3df11aed0c896fc`; September Retail Price Guide, SHA256 `3767de1e04ee7c8dc6bab14a6224868e4ca366f2ec4be2d8d3d13ec5cf45aafd`.

## Implemented

| Source | Implemented rule |
|---|---|
| Roller p74 | 0–3 shim layers, with quantities derived from mounting configuration rather than free-entered pieces. |
| Roller p74 single | No raceway: 2 positions. IM top raceway: 3 positions through 80 inches and 5 above. IM back / OM raceway: 2 through 40 inches, 3 through 80, 4 above. |
| Roller p74 dual | No raceway: 4 positions. Raceway: 4 through 40 inches, 5 through 80, 6 above; middle brackets 0/1/2 respectively. |
| Roller p74 coupled | No raceway: 2 shade brackets, N−1 links, N+1 shim positions. Outside raceway: sum the mounting bracket quantities of the individual component widths. |
| Roller p58 | Inside finished shade width is ordered width less ⅛ inch; outside is ordered width. Coupled assembly retains its individual order widths. |
| Roller pp33,41; Retail PDF p20 | Raceway automatically accompanies valances/SmartRelease. Selected dual raceway is included. Ordinary single optional raceway uses existing published surcharge. |
| Retail PDF p20 | Shim $7 each; assembly quantity multiplies the derived per-assembly count once. |

Typed `roller_hardware_v1` retains installation, shim layers, optional raceway in one atomic save. Server rebuilds the derived `norman_assembly_v1` hardware record. Old exact r2 identity is recognized without applying the new r3 hardware rules; editing/repricing selects current r3.

## Explicit exceptions and remaining work

- Roller p74 gives custom-width valance bracket formulas but omits rounding. No rounding convention or custom bracket quantity is invented.
- Inside coupled raceway brackets are pre-screwed; p74 gives no explicit shim count. Nonzero shim layers on this configuration remain held for factory confirmation.
- LightGuard360 and Cassette are excluded from this standard hardware schedule. Stale standard records must be cleared.
- Full common-valance grouping, finish selection, shared price allocation, and Roller Automate distribution panel membership remain a separate increment.
- Existing product dimensions, fabric/control compatibility and account pricing holds remain authoritative. This increment does not claim full Roller completion.

## Verification

Boundary tests cover 40/80 inches, inside deduction, dual, coupled 2/3/4, outside component sums, unsupported inside coupled shims, malformed selections, stale/forged quantities, exact $7 multiplication, included raceway, atomic save/reopen, record recomputation and historical r2 behavior. Production live proof remains parent-owned.

Production scenarios: outside single 36×60, two shim layers ⇒ four shims ($28 per shade); outside width 81 ⇒ eight shims ($56 per shade). Dual 81 wide, three layers ⇒ 18 shims and two middle brackets, raceway included. Save/reopen each typed hardware record, then verify dimensions force recomputation. Inside coupled + nonzero shim layers must remain held.
