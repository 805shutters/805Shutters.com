# Sundance source-grid audit — September 20, 2026

The independent PDF text-layer check passes for all 99 imported base grids: every numeric row, row count, inch height, and width header agrees with the pinned source. It reads text lines independently of the importer’s table-cell extraction. It does not certify current orderability, fabric routing, account pricing, or complete option rules.

## Repaired

- SheerView: recovered missing price group 5 (PDF 24 table 1, 221 cells), plus final 144-inch rows in groups 1–4 (52 cells).
- Aluminum: recognize first width bands 24–26 and 18–23, retaining their first columns (17 cells) and correcting heights previously taken from dollar amounts.
- Roller: recognize the printed `118` width with a trailing typographic tick; restore that column’s 15 cells.

Result: 98 → 99 grids; 18,711 → 19,016 numeric cells (+305). All existing IDs are preserved. Dealer/manual-price gates and selling policy remain unchanged.

## Independent golden evidence

| Guide/table | First source cell | Last source cell |
|---|---|---|
| Aluminum 2-inch, J-8 | 26 × 42 = 330 | 82 × 84 = 1,126 |
| Aluminum 1-inch, J-9 | 23 × 42 = 228 | 72 × 96 = 702; widths 82/92 unavailable at 54–96 height |
| Roller PDF 10 | 118 × 36 = 867 | 118 × 120 = 2,888 |
| SheerView PDF 24 table 1 | 24 × 36 = 559 | 116 × 144 = 5,410 |

The aluminum and SheerView values were also checked on rendered PDF pages. All 99 programs retain source IDs and page provenance. Boundary tests cover exact/fractional steps and unavailable cells; focused source fixtures use the independent values above.

Run `scripts/sundance/audit_source_rows.py --source-dir <pinned PDFs> --output <report.json>` to reproduce the full source-row comparison. Run `scripts/sundance/test_importer.py` for malformed-header/merged-height regression fixtures.

## Remaining grid coverage

A scan of all 18 pinned PDFs found eight additional nonduplicate tables requiring separate work: Stock Vertical base pricing on K-12, four Walden Premier liner/edge-binding tables on PDF 20–21, and three Walden Select liner/edge-binding tables on PDF 19. These are recorded as unresolved; option tables must not be substituted for base product grids. The combined binder repeats individual-guide tables.

The six previously empty families have no simple omitted base grid: Verticell and specialty cellular require related-grid rules; shutter base rates are missing; exterior cable/zip are square-foot net schedules. Current account terms and complete configuration charges remain unresolved. This repair is source-grid correctness, not automatic-pricing certification.
