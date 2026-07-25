import { describe, expect, it } from "vitest";
import { buildMobileContractItems, buildMobileJobBuckets, filterMobileContracts } from "@/lib/crm/mobile-technician";

describe("mobile technician job buckets", () => {
  it("groups jobs by lifecycle bucket and sorts customers", () => {
    const jobs = [
      { id: "2", status: "sold", customer_name: "Zoe Customer" },
      { id: "1", status: "scheduled", customer_name: "Amy Customer" },
      { id: "3", status: "sold", customer_name: "Bob Customer" },
    ] as never[];
    const buckets = buildMobileJobBuckets(jobs);
    expect(buckets.map((bucket) => [bucket.id, bucket.jobs.map((job) => job.customer_name)])).toEqual([
      ["scheduled", ["Amy Customer"]],
      ["sold", ["Bob Customer", "Zoe Customer"]],
    ]);
  });
});

describe("mobile contracts", () => {
  const files = [
    {
      customerName: "Zoe Customer",
      contracts: [{ id: "z", title: "Z Contract", contract_url: "/z", share_token: null, status: "signed", signed_at: null, total_amount: 200 }],
    },
    {
      customerName: "Amy Customer",
      contracts: [{ id: "a", title: "A Contract", contract_url: null, share_token: "amy-token", status: "signed", signed_at: null, total_amount: 100 }],
    },
  ] as never[];

  it("sorts contracts alphabetically and builds customer-facing links", () => {
    const items = buildMobileContractItems(files);
    expect(items.map((item) => [item.customerName, item.url])).toEqual([
      ["Amy Customer", "/quote/amy-token"],
      ["Zoe Customer", "/z"],
    ]);
  });

  it("searches contracts by customer name", () => {
    expect(filterMobileContracts(buildMobileContractItems(files), "amy").map((item) => item.id)).toEqual(["a"]);
  });
});
