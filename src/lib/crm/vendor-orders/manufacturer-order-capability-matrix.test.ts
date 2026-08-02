import { describe, expect, it } from "vitest";
import registryJson from "./manufacturer-order-form-registry.json";
import { MANUFACTURER_ORDER_CAPABILITY_MATRIX, orderEntryRouteCapability } from "./manufacturer-order-capability-matrix";

describe("manufacturer order capability matrix", () => {
  it("audits every exact catalog ordering route once", () => {
    const registryRoutes = Object.values(registryJson.manufacturers).flat().map((entry) => entry.routing_key).sort();
    const capabilityRoutes = MANUFACTURER_ORDER_CAPABILITY_MATRIX.map((entry) => entry.routingKey).sort();
    expect(capabilityRoutes).toEqual(registryRoutes);
    expect(new Set(capabilityRoutes).size).toBe(capabilityRoutes.length);
  });
  it("fails closed for missing routes and unmapped Onyx US Made Vinyl", () => {
    expect(orderEntryRouteCapability("onyx:missing")).toBeNull();
    expect(orderEntryRouteCapability("onyx:onyx_us_made_vinyl")).toMatchObject({ state: "portal_mapping_required", enterOrderMode: "blocked" });
  });
  it("records Lotus packet preparation without external send", () => {
    for (const route of MANUFACTURER_ORDER_CAPABILITY_MATRIX.filter((entry) => entry.manufacturer === "Lotus")) {
      expect(route).toMatchObject({ state: "document_packet_verified", enterOrderMode: "document_packet" });
      expect(route.exactBoundary).toContain("never email");
    }
  });
});
