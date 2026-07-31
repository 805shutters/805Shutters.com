import { describe, expect, it } from "vitest";
import { restrictDashboardPayablesForViewer } from "@/lib/crm/payables-visibility";

function person(person: "ken" | "mike" | "jessica", amount: number) {
  return {
    person, label: person, earningsAccess: "visible", earned: amount, paid: 1, owed: amount - 1,
    advanceBalance: 2, soldEarned: amount, soldJobCount: 3,
    allTimeJobSummary: { available: true, valueLabel: "qualifying payable value", sold: { count: 3, total: amount }, active: { count: 2, total: amount - 1 }, closed: { count: 1, total: 1 } },
    jobCount: 3, activeJobCount: 2,
    items: [{ person, itemKey: `${person}-item` }], activeItems: [{ person, itemKey: `${person}-item` }], jobItems: [{ person, itemKey: `${person}-job` }]
  };
}

function dashboard() {
  return { partnerPaymentLedger: {
    people: { ken: person("ken", 100), mike: person("mike", 200), jessica: person("jessica", 300) },
    activeItems: [{ person: "ken", itemKey: "ken-item" }, { person: "mike", itemKey: "mike-item" }, { person: "jessica", itemKey: "jessica-item" }],
    history: [{ person: "ken", amount: 10 }, { person: "mike", amount: 20 }, { person: "jessica", amount: 30 }], kenBuyout: {}
  } } as never;
}

describe("payables earnings visibility", () => {
  it("allows the owner/admin login to receive every person's earnings", () => {
    const result = restrictDashboardPayablesForViewer(dashboard(), " 805SHUTTERS@GMAIL.COM ");
    expect(result.partnerPaymentLedger.people.jessica.soldEarned).toBe(300);
    expect(result.partnerPaymentLedger.history).toHaveLength(3);
  });

  it("allows a standard CRM user only their own earnings and omits restricted fields", () => {
    const result = restrictDashboardPayablesForViewer(dashboard(), "jessica@805shutters.com");
    expect(result.partnerPaymentLedger.people.jessica.soldEarned).toBe(300);
    expect(result.partnerPaymentLedger.people.mike.earningsAccess).toBe("restricted");
    expect(Object.hasOwn(result.partnerPaymentLedger.people.mike, "soldEarned")).toBe(false);
    expect(Object.hasOwn(result.partnerPaymentLedger.people.mike, "items")).toBe(false);
    expect(result.partnerPaymentLedger.activeItems).toEqual([{ person: "jessica", itemKey: "jessica-item" }]);
    expect(result.partnerPaymentLedger.history).toEqual([{ person: "jessica", amount: 30 }]);
  });

  it("returns no earnings to an unauthenticated or invalid identity", () => {
    for (const email of [null, "invalid@example.com"]) {
      const result = restrictDashboardPayablesForViewer(dashboard(), email);
      expect(Object.values(result.partnerPaymentLedger.people).every((entry) => entry.earningsAccess === "restricted")).toBe(true);
      expect(result.partnerPaymentLedger.activeItems).toEqual([]);
      expect(result.partnerPaymentLedger.history).toEqual([]);
    }
  });
});
