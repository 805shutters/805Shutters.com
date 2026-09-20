# Sundance and Louvolite Zebra reconciliation — 2026-09-20

Status: source-backed collection and color routing implemented and tested; production save/reopen proof pending. All customer pricing remains manual.

`G-Zebra-Shades-V2.pdf` page 3 contains 38 collections: 16 Sundance Caress and 22 Louvolite Visions. Its printed effective date is August 1, 2024; the cover separately says October 2024 update. The exact roll width, band size, privacy type, source hash and existing program are retained in `zebra-fabrics.source.json`. All 77 captured authenticated Caress-Zebra dealer labels reconcile unambiguously: 75 Sundance and two Louvolite (Modella Sand and Rimini Ash). The other 22 source collections retain collection destinations with an explicit no-reconciled-dealer-color warning. Their current color assortment remains unresolved; no color identities are invented and no collection is declared discontinued.

All eight existing programs have source destinations. Orlando Blackout uses group 4 while Orlando light filtering uses group 2. Capri Black & Navy uses group 6 while other Capri uses group 5; neither has captured current dealer colors. The UI and both saved editors retain exact independent product identities and clear a stale color when its collection changes. Railroading is unverified, not inferred from an absent source field.

Independent first-cell retail checks: Sundance groups 1–4 at 24 × 36 = 305, 319, 356, 362. Louvolite groups 5–8 at 36 × 36 = 519, 622, 685, 753. These anchors were read from PDF pages 5–8 independently of the index parser. Tests also verify the Orlando privacy split, exact 77 identities, 22 collection gaps and saved-editor manufacturer separation.

Remaining configuration work: 10–96-inch width and 16–96-inch height restrictions, control-specific motor minima, cassette/chain color choices, inside-mount deduction, two-on-one alignment, net cordless/chain/assembly charges and motor/power/remote schedules. Page 9 expressly marks stainless chain $10, cordless $45 and two-on-one $35 as **net**; these cannot be treated as retail grid additions or assumed customer prices. Shared order accessories and account price evidence remain unresolved. No automatic-pricing eligibility claim is made.

Reproduce with `scripts/sundance/import_zebra.py --source-dir <locked PDFs> --portal-dir <captured menus>`. Source SHA-256 is checked before extraction.
