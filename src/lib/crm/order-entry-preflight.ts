/**
 * Order-entry preflight lives in line_event.preflight_order_entry, which
 * public.enqueue_line_event calls before it writes a line event or wakes a
 * worker. This module records the wake design the database enforces.
 *
 * The designed wake is one HTTP call per manufacturer, as that manufacturer's
 * role. public.wake_line_event_worker does not perform the call.
 * Polar is in the order-entry field file and is not a line-event manufacturer,
 * so it has no wake role.
 */

export const ORDER_ENTRY_FIELD_FILE = "data/order-entry/805-order-entry-fields.json";

export const ORDER_ENTRY_FIELD_FILE_SHA256 =
  "2b54653e7e95ea8adbba325853653fb22f83c327edefd55dff6363ff54bed8fd";

export const ORDER_ENTRY_WAKE_TRANSPORT = "http" as const;

export const ORDER_ENTRY_MANUFACTURER_ROLES = {
  norman: "norman_line_worker",
  onyx: "onyx_line_worker",
  sundance: "sundance_line_worker",
  lotus: "lotus_line_worker",
} as const;

export const ORDER_ENTRY_WAKE_EXCLUDED = ["polar"] as const;

export type OrderEntryNeedsInput = {
  field_key: string;
  result: "needs_input";
  reason: string;
};
