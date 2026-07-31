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
  return {
    bookkeepingRows: [{ mikeProfit: 400, remainingProfitBeforeJessica: 500 }],
    bookkeepingTotals: { mikeProfit: 400 },
    customerFiles: [{ bookkeepingRows: [{ mikeProfit: 400, remainingProfitBeforeJessica: 500 }] }],
    commissionPayments: [{ id: "mike-payment", recipient: "mike" }, { id: "jessica-payment", recipient: "jessica" }],
    commissionPaymentAllocations: [{ id: "mike-allocation", recipient: "mike" }, { id: "jessica-allocation", recipient: "jessica" }],
    commissionSummary: {
      monthly: [{ periodMonth: "2026-07-31", mikeEarned: 400, mikePaid: 100, mikeBalance: 300, jessicaEarned: 100, jessicaPaid: 50, jessicaBalance: 50 }],
      totals: { mikeEarned: 400, mikePaid: 100, mikeOwed: 300, jessicaEarned: 100, jessicaPaid: 50, jessicaOwed: 50 }
    },
    partnerPaymentLedger: {
      people: {
        ken: person("ken", 100),
        mike: person("mike", 200),
        jessica: {
          ...person("jessica", 300),
          jobItems: [{ person: "jessica", itemKey: "jessica-job", mikeProfit: 200, remainingProfitBeforeJessica: 300 }]
        }
      },
      activeItems: [{ person: "ken", itemKey: "ken-item" }, { person: "mike", itemKey: "mike-item" }, { person: "jessica", itemKey: "jessica-item" }],
      history: [{ person: "ken", amount: 10 }, { person: "mike", amount: 20 }, { person: "jessica", amount: 30 }], kenBuyout: {}
    }
  } as never;
}

describe("payables earnings visibility", () => {
  it("allows only Mike's login to receive Mike-linked financial fields", () => {
    const result = restrictDashboardPayablesForViewer(dashboard(), " 805SHUTTERS@GMAIL.COM ");
    expect(result.partnerPaymentLedger.people.jessica.soldEarned).toBe(300);
    expect(result.partnerPaymentLedger.history).toHaveLength(3);
    expect(result.bookkeepingRows[0].mikeProfit).toBe(400);
    expect(result.commissionPayments).toHaveLength(2);
  });

  it("allows a standard CRM user only their own earnings and omits restricted fields", () => {
    const result = restrictDashboardPayablesForViewer(dashboard(), "jessica@805shutters.com");
    expect(result.partnerPaymentLedger.people.jessica.soldEarned).toBe(300);
    expect(result.partnerPaymentLedger.people.mike.earningsAccess).toBe("restricted");
    expect(Object.hasOwn(result.partnerPaymentLedger.people.mike, "soldEarned")).toBe(false);
    expect(Object.hasOwn(result.partnerPaymentLedger.people.mike, "items")).toBe(false);
    expect(result.partnerPaymentLedger.activeItems).toEqual([{ person: "jessica", itemKey: "jessica-item" }]);
    expect(result.partnerPaymentLedger.history).toEqual([{ person: "jessica", amount: 30 }]);
    expect(Object.hasOwn(result.bookkeepingRows[0], "mikeProfit")).toBe(false);
    expect(Object.hasOwn(result.bookkeepingRows[0], "remainingProfitBeforeJessica")).toBe(false);
    expect(Object.hasOwn(result.bookkeepingTotals, "mikeProfit")).toBe(false);
    expect(Object.hasOwn(result.customerFiles[0].bookkeepingRows[0], "mikeProfit")).toBe(false);
    expect(result.commissionPayments).toEqual([{ id: "jessica-payment", recipient: "jessica" }]);
    expect(result.commissionPaymentAllocations).toEqual([{ id: "jessica-allocation", recipient: "jessica" }]);
    expect(Object.hasOwn(result.commissionSummary.totals, "mikeEarned")).toBe(false);
    expect(Object.hasOwn(result.commissionSummary.totals, "mikePaid")).toBe(false);
    expect(Object.hasOwn(result.commissionSummary.totals, "mikeOwed")).toBe(false);
    expect(Object.hasOwn(result.commissionSummary.monthly[0], "mikeEarned")).toBe(false);
    expect(Object.hasOwn(result.partnerPaymentLedger.people.jessica.jobItems[0], "mikeProfit")).toBe(false);
    expect(Object.hasOwn(result.partnerPaymentLedger.people.jessica.jobItems[0], "remainingProfitBeforeJessica")).toBe(false);
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
