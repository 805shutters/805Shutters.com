import { describe, expect, it } from "vitest";
import type { CrmCustomerFile } from "@/lib/crm/types";
import { findMobileBookkeepingFileById } from "@/lib/crm/mobile-bookkeeping";

const files = [
  {
    id: "customer-a",
    customerName: "Same Name",
    bookkeepingRows: [{ id: "row-a", depositPaid: 1200, balancePaid: 300, balance: 1500 }]
  },
  {
    id: "customer-b",
    customerName: "Same Name",
    bookkeepingRows: [{ id: "row-b", depositPaid: 2500, balancePaid: 900, balance: 600 }]
  }
] as unknown as CrmCustomerFile[];

describe("mobile bookkeeping exact customer hydration", () => {
  it("selects by the exact customer file id even when names collide", () => {
    const selected = findMobileBookkeepingFileById(files, "customer-b");

    expect(selected?.bookkeepingRows[0]).toMatchObject({
      id: "row-b",
      depositPaid: 2500,
      balancePaid: 900,
      balance: 600
    });
  });

  it("does not fall back to a name or a partial id", () => {
    expect(findMobileBookkeepingFileById(files, "Same Name")).toBeNull();
    expect(findMobileBookkeepingFileById(files, "customer")).toBeNull();
    expect(findMobileBookkeepingFileById(files, "")).toBeNull();
  });
});
