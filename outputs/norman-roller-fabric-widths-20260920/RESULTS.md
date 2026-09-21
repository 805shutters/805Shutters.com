# Exact Roller fabric widths

439 unique fabric/color codes extracted from the September16 Roller Guide tables pp6–18. The set equals all439 current available CRM Roller colors; no missing or extra code. Width definition p5 explicitly distinguishes fabric width from maximum order shade width. September1 withdrawalF1561 is absent from this current source and registry.

Merged source cells are extracted column-by-column within each table. Visual checks of pp10/14 confirm Charlotte94, Springtide96, BaliF0668/F1668/F1669=78 versusF1926/F1927/F2023–F2027=94.5. Revised ValerieF0739/F0743 andHayesF0751 are118; ValerieF0740/F0741 remain106. Seven widths are present:78,94,94.5,96,106,110,118. No guessed collection-wide118 fallback is used.

Fabric Valance section maximum=min(95,fabricWidth−7). Curved wrapped fascia maximum=min(95,fabricWidth). Standalone/separate valances derive equal sections and reject custom sections exceeding that exact maximum. Current common groups record exact fabric/sourcepage, section maximum, minimum joint count and six-section/two-section material maximum. Mixed shade fabrics require one explicit shared valance fabric override on allmembers; no firstshade assumption. Common pricing/allocation and custom bracket-rounding holds remain.

Current Roller catalog moves to materialr6; historicalpanelr5 remains recognized and retains its former materialhold until explicit repricing. The new valance destinations remain held regardless of this now-resolved material-width implementation gap. Shared largest-hardware derivation is a separate nextincrement.

Reproduction: run `scripts/extract-norman-roller-fabric-widths.py` with the exact sourcePDF in bundled Python withpdfplumber. SourceSHA256 and everypage/code/width are in `source-widths.json` and CSV. Tests assert complete439identityset, allcolor-specific exceptions, materialboundaries, mixedfabricoverrides, historicalversion behavior, and standalonecustomsplice rejection.

Validation: 6,261 tests passed, 28 skipped; TypeScript and production build passed. These checks establish implemented source mappings and saved-rule behavior, not live CRM proof or dealer pricing confirmation.
