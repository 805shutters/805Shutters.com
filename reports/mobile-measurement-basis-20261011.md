# Required measurement meaning before dimensions

The mobile supplier sequence now has six steps: family, manufacturer/product, room, measurement basis or mount, dimensions, and configuration.

- Shutters offer **Window size** and **Frame-to-frame size**, serialized using the existing `size_type` values `W - Window Size` and `F - Frame to Frame`.
- Blinds and the other non-shutter families offer **Inside Mount** and **Outside Mount**, stored in the existing `mount_type` field.
- Neither choice is guessed. Width and height cannot be opened until the basis is known; Save window and Review also check it.
- Supplier-program selection preserves these measurement choices. Other incompatible program selections continue to be cleared by the existing catalog boundary logic.
- Changing the choice in the new measurement step clears width, height and their fractions for re-entry. There is no automatic window-to-frame conversion or inside-to-outside adjustment. Manually set prices and frozen or existing CRM quotes remain protected.
- Repeating the same family retains configuration and its measurement basis, while room and dimensions remain fresh for the new opening.

The existing supplier controls still validate the chosen program, frame, mount and application. Program-specific restrictions do not authorize fabricated measurements. The supplemental handoff fields remain for explicit supplier instructions.

Local tests cover both shutter bases, both mount choices, persistence through catalog-program selection and reload, dimension clearing on a basis change, immutable draft handling, and the existing multi-window flows. All data is synthetic and external requests are blocked in the UI fixture.

This change is prepared locally for review. No publication, deployment, migration, supplier submission or customer-data write is included. Production supplier processing stays disabled.
