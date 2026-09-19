import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { currentQuoteLineIds, refreshQuoteV2Rows } from "./quoteV2RowRefresh";

describe("server-owned quote row refresh", () => {
  it("loads a newly inserted design after the slow parent refresh without a React render", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
    const quoteKey = ["quote", "audit"];
    const lineKey = [...quoteKey, "lines"];
    const designKey = [...quoteKey, "designs"];
    client.setQueryData(quoteKey, {});
    client.setQueryData(lineKey, [{ id: "existing" }]);
    client.setQueryData(designKey, [{ id: "existing-design" }]);
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const reads: string[][] = [];
    const lineObserver = new QueryObserver(client, { queryKey: lineKey, queryFn: async () => {
      await gate;
      return [{ id: "existing" }, { id: "new-san-clemente" }];
    } });
    const designObserver = new QueryObserver(client, { queryKey: designKey, queryFn: async () => {
      const ids = currentQuoteLineIds(client, lineKey);
      reads.push(ids);
      return ids.map(id => ({ id: `${id}-design`, supplier: "Norman" }));
    } });
    const stopLines = lineObserver.subscribe(() => {});
    const stopDesigns = designObserver.subscribe(() => {});
    try {
      const refreshed = refreshQuoteV2Rows(client, quoteKey, lineKey, designKey);
      await Promise.resolve();
      expect(reads).toEqual([]);
      release();
      await refreshed;
      expect(reads).toEqual([["existing", "new-san-clemente"]]);
      expect(client.getQueryData(designKey)).toContainEqual({ id: "new-san-clemente-design", supplier: "Norman" });
    } finally {
      stopLines(); stopDesigns(); client.clear();
    }
  });
});
