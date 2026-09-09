import { describe, expect, it } from "vitest";
import { candidateVisit, writeCalendarWithRoutes } from "./scheduling";

const date = "2035-10-01";
const actor = {
  actorId: "11111111-1111-4111-8111-111111111111",
  actorEmail: "staff@local.invalid",
  reason: "staff_reschedule_extra_buffer_override" as const,
};

function recorder(
  event = candidateVisit(date, "10:00", "123 Main St", 5),
  options: { protected?: boolean; extraEvents?: ReturnType<typeof candidateVisit>[] } = {},
) {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const supabase = {
    async rpc(name: string, args: Record<string, unknown>) {
      calls.push({ name, args });
      if (name === "booking_schedule_snapshot") {
        return {
          data: {
            revision: "1",
            events: [event, ...(options.extraEvents || [])],
            slots: [],
            protectedIds: options.protected === false ? [] : [event.id],
            bufferExceptions: [],
          },
          error: null,
        };
      }
      return { data: { ...event, ...(args.p_event as object) }, error: null };
    },
  };
  return {
    calls,
    event,
    supabase: supabase as unknown as Parameters<typeof writeCalendarWithRoutes>[0],
  };
}

describe("calendar reschedule buffer override transport", () => {
  it("uses the dedicated RPC with server actor attribution only when explicitly supplied", async () => {
    const { calls, event, supabase } = recorder();
    await writeCalendarWithRoutes(
      supabase,
      "update",
      {
        id: event.id,
        start_at: event.start_at,
        end_at: event.end_at,
        status: "rescheduled",
      },
      event,
      actor,
    );
    expect(calls.at(-1)).toMatchObject({
      name: "booking_calendar_reschedule",
      args: {
        p_allow_buffer_override: true,
        p_actor_id: actor.actorId,
        p_actor_email: actor.actorEmail,
        p_reason: actor.reason,
      },
    });

    const strict = recorder();
    await writeCalendarWithRoutes(
      strict.supabase,
      "update",
      { id: strict.event.id, status: "rescheduled" },
      strict.event,
    );
    expect(strict.calls.at(-1)?.name).toBe("booking_calendar_write");
  });

  it("forces a fresh route proof for an initially unprotected overridden visit", async () => {
    const event = candidateVisit(date, "10:00", "Current Address", 5);
    const next = candidateVisit(date, "12:00", "Next Address", 5);
    const { calls, supabase } = recorder(event, {
      protected: false,
      extraEvents: [next],
    });
    await expect(
      writeCalendarWithRoutes(
        supabase,
        "update",
        {
          id: event.id,
          start_at: candidateVisit(date, "10:30", "Current Address", 5, event.id).start_at,
          end_at: candidateVisit(date, "10:30", "Current Address", 5, event.id).end_at,
          status: "rescheduled",
        },
        event,
        actor,
      ),
    ).rejects.toThrow(/missing information/i);
    expect(calls.some((call) => call.name === "booking_calendar_reschedule")).toBe(false);
  });

  it("rejects override authorization for non-reschedule operations", async () => {
    const { supabase } = recorder();
    await expect(
      writeCalendarWithRoutes(
        supabase,
        "insert",
        candidateVisit(date, "14:00", "123 Main St", 5),
        undefined,
        actor,
      ),
    ).rejects.toThrow(/only available for rescheduling/i);
  });
});
