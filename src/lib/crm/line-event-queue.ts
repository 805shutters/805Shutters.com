export const LINE_EVENT_SCHEMA_ID = "805-line-event/v1" as const;

export const LINE_EVENT_MANUFACTURERS = ["norman", "onyx", "sundance", "lotus"] as const;

export type LineEventManufacturer = (typeof LINE_EVENT_MANUFACTURERS)[number];

export type LineEventWake = {
  woken: boolean;
  reason: "wake_disabled" | "wake_unconfigured" | "http";
  manufacturer: LineEventManufacturer;
  event_id: string;
  schema: typeof LINE_EVENT_SCHEMA_ID;
};

type RpcError = { message: string } | null;

export type LineEventRpc = {
  rpc: (
    fn: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: RpcError }>;
};

/**
 * The CRM's one call that queues a confirmed window for its manufacturer.
 * public.enqueue_line_event runs order-entry preflight before it writes the
 * line event, then calls public.wake_line_event_worker. This module is a
 * documented no-op for outbound calls: it does not call Telegram, Twilio,
 * HTTP, pg_net, or the manufacturer order-worker route, and it does not turn
 * a switch on. The database wake returns wake_disabled unless
 * line_event.wake_http is explicitly turned on for Norman, and a missing
 * worker URL or secret fails closed. One wake posts one Norman event.
 * Do not add a second notifier beside it.
 */
export async function enqueueManufacturerLineEvent(
  db: LineEventRpc,
  input: {
    lineId: string;
    version: number;
    manufacturer: LineEventManufacturer;
    payload?: Record<string, unknown>;
  },
) {
  if (!LINE_EVENT_MANUFACTURERS.includes(input.manufacturer)) {
    throw new Error("manufacturer must be norman, onyx, sundance, or lotus");
  }
  const { data, error } = await db.rpc("enqueue_line_event", {
    p_line_id: input.lineId,
    p_version: input.version,
    p_manufacturer: input.manufacturer,
    p_payload: input.payload ?? {},
  });
  if (error) throw new Error(error.message);
  return data;
}
