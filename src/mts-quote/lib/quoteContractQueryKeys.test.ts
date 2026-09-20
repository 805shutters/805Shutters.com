import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { contractDesignQueryKey, contractGroupQueryKeys } from "./quoteContractQueryKeys";

const quote = (id: string, revision = 1) => ({ id, quote_group_id: "group", quote_v2_revision: revision, updated_at: `revision-${revision}` });
const client = () => new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });

describe("contract dependent query freshness", () => {
  it("reproduces the old fixed-key closure race when D arrives after A/B/C", async () => {
    const cache = client(); let ids = ["A", "B", "C"];
    const options = () => ({ queryKey: ["group-line-items", "group"], queryFn: async () => [...ids] });
    const observer = new QueryObserver(cache, options()); const stop = observer.subscribe(() => {});
    try {
      await vi.waitFor(() => expect(observer.getCurrentResult().data).toEqual(["A", "B", "C"]));
      ids = [...ids, "D"]; observer.setOptions(options());
      await Promise.resolve();
      expect(observer.getCurrentResult().data).toEqual(["A", "B", "C"]);
    } finally { stop(); cache.clear(); }
  });

  it("fetches new sibling lines and their designs when parent results arrive later", async () => {
    const cache = client(); let siblings = [quote("A"), quote("B"), quote("C")];
    let keys = contractGroupQueryKeys("group", siblings, siblings[0]);
    const lineOptions = () => ({ queryKey: keys.lines, queryFn: async () => keys.quoteIds.map(id => `${id}-line`) });
    const lines = new QueryObserver(cache, lineOptions()); const stopLines = lines.subscribe(() => {});
    let lineIds = ["A-line", "B-line", "C-line"];
    const designOptions = () => ({ queryKey: keys.designs(lineIds), queryFn: async () => lineIds.map(id => `${id}-design`) });
    const designs = new QueryObserver(cache, designOptions()); const stopDesigns = designs.subscribe(() => {});
    try {
      await vi.waitFor(() => expect(designs.getCurrentResult().data).toHaveLength(3));
      siblings = [...siblings, quote("D")]; keys = contractGroupQueryKeys("group", siblings, siblings[0]);
      lines.setOptions(lineOptions());
      await vi.waitFor(() => expect(lines.getCurrentResult().data).toContain("D-line"));
      lineIds = lines.getCurrentResult().data!; designs.setOptions(designOptions());
      await vi.waitFor(() => expect(designs.getCurrentResult().data).toContain("D-line-design"));
    } finally { stopLines(); stopDesigns(); cache.clear(); }
  });

  it("replaces an incomplete result after restoration with the same IDs and a newer active revision", async () => {
    const cache = client(); const staleGroup = [quote("A"), quote("D")]; let active = quote("D");
    let keys = contractGroupQueryKeys("group", staleGroup, active);
    let saved = { status: "incomplete", price: 0 };
    const options = () => ({ queryKey: keys.designs(["D-line"]), queryFn: async () => ({ ...saved }) });
    const observer = new QueryObserver(cache, options()); const stop = observer.subscribe(() => {});
    try {
      await vi.waitFor(() => expect(observer.getCurrentResult().data?.status).toBe("incomplete"));
      saved = { status: "authoritative", price: 543 }; active = quote("D", 2);
      keys = contractGroupQueryKeys("group", staleGroup, active); observer.setOptions(options());
      await vi.waitFor(() => expect(observer.getCurrentResult().data).toEqual({ status: "authoritative", price: 543 }));
      expect(staleGroup[1].quote_v2_revision).toBe(1);
    } finally { stop(); cache.clear(); }
  });

  it("keys active designs by line IDs and keeps reordered membership stable without rewriting history", () => {
    expect(contractDesignQueryKey("A", ["new", "old"])).not.toEqual(contractDesignQueryKey("A", ["old"]));
    const historical = Object.freeze(quote("A")); const active = Object.freeze(quote("D", 2));
    const first = contractGroupQueryKeys("group", [historical], active);
    const reordered = contractGroupQueryKeys("group", [active, historical], active);
    expect(first).toMatchObject({ quoteIds: ["A", "D"], lines: reordered.lines });
    expect(first.designs(["b", "a"])).toEqual(reordered.designs(["a", "b"]));
    expect(historical.quote_v2_revision).toBe(1);
  });
});
