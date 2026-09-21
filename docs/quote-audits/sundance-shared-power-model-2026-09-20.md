# Sundance shared power: source-backed order records

Implemented from Sundance Roller guide PDF29 and Louvolite Roller guide PDF17: Simphony 24V DC distribution box, maximum 18 motors, $800 **net** per box. No account factor, customer selling price or cross-voltage compatibility is inferred.

Saved input is the chosen panel identity on each selected line or individual assembly component. The server clears client-derived records and reconstructs versioned panel connections from explicitly selected designs. Alternative variants do not contribute motors or retain stale derived allocations. Line quantities multiply motor count. Dual independent shades count both motors; a coupled assembly counts only its explicitly referenced motor-owning component. Parent-level and duplicate coupled connections are rejected.

The derived record identifies every connected line/component, total motors, capacity and one deterministic owner. The owner carries $800 source net evidence; all other connected lines carry zero for that panel. Individual transformer or legacy distribution-box quantities cannot coexist with a panel connection. More than 18 motors blocks every connected line. Removing the former owner reassigns the charge. Changing controls clears the old power connection. The record is hidden from customer descriptions.

Validation: 12 focused model scenarios plus two authoritative-backend scenarios, included in 612 passing Sundance/shared/formatter tests; TypeScript and diff checks pass. Tests cover 18 versus 19 motors, quantities, dual versus coupled assemblies, independent panels, wrong voltage/family, malformed panel IDs, forged records, unselected variants, JSON reconstruction, duplicate supplies and owner removal.

The persisted scalar inputs support reconstructing the order; a successfully priced immutable snapshot is still unavailable while Sundance's account-price gate is held. Live panel-input proof remains pending deployment. Other brands of shared power, remote/hub assignments and the complete manufacturer order remain separate source/account work. This increment does not enable automatic customer pricing.
