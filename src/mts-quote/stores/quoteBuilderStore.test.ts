import { beforeEach, describe, expect, it } from "vitest";
import { useQuoteBuilderStore } from "./quoteBuilderStore";

beforeEach(() => useQuoteBuilderStore.getState().resetBuilder());
describe("switching saved quote alternatives", () => {
  it("clears an unfinished measurement and copy targets when opening another quote", () => {
    const store = useQuoteBuilderStore.getState();
    store.setAccountId("account"); store.setActiveQuote("C"); store.setActiveTab("builder");
    store.selectProduct("shutters"); store.selectRoom("Living room"); store.setWidthWhole(93);
    store.setCopySource("C-line-1"); store.setCopyMode("some"); store.toggleCopyTarget("C-line-2");
    store.setActiveVariant("B"); store.setActiveQuote("D");
    expect(useQuoteBuilderStore.getState()).toMatchObject({
      activeQuoteId: "D", activeAccountId: "account", activeTab: "builder",
      showMeasurementGrid: false, pendingWidth: null, pendingHeight: null,
      measurementStep: "idle", selectedProductType: null, selectedRoom: null,
      copyMode: "none", copySourceItemId: null, selectedCopyTargets: [], activeVariant: "A",
    });
  });
  it("preserves current edits when selecting the already active quote", () => {
    const store = useQuoteBuilderStore.getState(); store.setActiveQuote("C");
    store.selectRoom("Living room"); store.setWidthWhole(93); store.setActiveQuote("C");
    expect(useQuoteBuilderStore.getState()).toMatchObject({ showMeasurementGrid: true, pendingWidth: { whole: 93 } });
  });
});
