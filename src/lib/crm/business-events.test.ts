import { it, expect } from "vitest";
import { businessEventToActivity } from "./business-events";
import {
  operationalTimeline,
  type UnifiedActivityEvent,
} from "./unified-activity";
it("shows original date, revised date, reason and actor", () => {
  const e = businessEventToActivity({
    id: "event",
    source_id: "task",
    source_table: "crm_accountability_tasks",
    event_type: "task_changed",
    actor: "Mike",
    before_data: { due_on: "2026-09-04" },
    after_data: { due_on: "2026-09-07", title: "Return visit" },
    metadata: { reason: "Replacement delayed" },
  });
  expect(e.metadata.description).toContain("2026-09-04 → 2026-09-07");
  expect(e.metadata.description).toContain("Replacement delayed");
  expect(e.actor_email).toBe("Mike");
});
it("groups only exact editing sessions and retains the raw source IDs", () => {
  const event = {
    id: "a",
    sourceId: "a",
    timestamp: "2026-09-04T20:00:00Z",
    entityId: "form-a",
    entityType: "measure",
    actorEmail: "Mike",
    autosave: true,
  } as UnifiedActivityEvent;
  const raw = [
    event,
    { ...event, id: "b", sourceId: "b", timestamp: "2026-09-04T19:50:00Z" },
    { ...event, id: "c", sourceId: "c", entityId: "form-b" },
    { ...event, id: "visitor", telemetry: true },
  ];
  const out = operationalTimeline(raw);
  expect(out).toHaveLength(2);
  expect(out[0].groupedSourceIds).toEqual(["a", "b"]);
  expect(raw[0].groupedSourceIds).toBeUndefined();
});
