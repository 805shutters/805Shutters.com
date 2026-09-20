# Roller Automate shared panel — September 20 increment

Source: Motorization Guide 2026-09-16.pdf p75, SHA256 `85c5fd2c0d813c879d22776b73f23132243454376b15e52c9451b4cb1f20c1b8`. Scope: Automate 12V low-voltage motors, specifically including Soluna Roller, Roman and PerfectSheer.

- One panel connects up to 18 motors. Dual Roller uses two motors per ordered assembly; standard coupled pair uses one, independent pair and three/four-shade coupled groups use two. Quantities multiply physical motors, not panel charges.
- One included black AC cord per white panel; one included white connector harness per motor. Saved server record retains these quantities. No unspecified amp load is invented for the Automate panel.
- Server reconstructs connected line IDs and deterministic owner, discarding browser allocation records. Removing the owner reassigns the one panel charge. Over-capacity or incompatible power blocks every connected selected line.
- Existing catalog Automate panel retail $1,133 charges once, including when owner quantity exceeds one. No change to dealer factors or selling policy. No generic billing-scope override is accepted from the browser.
- One UI selection writes power supply and panel identity atomically. Compatible Roman/PerfectSheer can share the same panel. Other Roller motor families retain existing behavior and holds.
- Current Roller revision r5; prior r4/r3/r2 recognized for historical pricing. New edits/repricing use r5.

Tests include 18/19-motor capacity, dual and coupled topology, included accessories, mixed compatible Roman membership, forged allocation/counts, owner deletion, save/reopen, exact once-only $1,133 and actual authoritative CRM backend customer-delivery blocking on overload. Separate source-backed common-valance exceptions remain unchanged.

Live verification scenario: two Automate Low Voltage DC Roller lines, quantities 4 and 5, both Panel 1. Reopen with nine total connections, only the first owner charged $1,133, four/five included harnesses and one AC cord. Change quantities to nine and ten: both must block. Delete the first line: remaining line owns the panel. Dual quantity four plus Single quantity ten uses 18 motors; increase Single to eleven and both must block.

### Production picker field correction

Live internal quote 805-0346 exposed that the existing generic Motor / Power System picker saves `power_configuration`, while the new shared-panel UI initially read only `roller_power_configuration`. The server adapter already normalizes both. The panel component now follows the same precedence and accepts both; an incompatible explicit canonical field still wins over a stale alias. Rendering regressions verify visibility and the selected panel for both identities; the actual backend panel test now uses the production unprefixed picker field. Five focused tests and TypeScript no-emit pass. Live panel proof continues after this narrow correction is deployed.
