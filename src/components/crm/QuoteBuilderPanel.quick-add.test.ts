import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  fileURLToPath(new URL("./QuoteBuilderPanel.tsx", import.meta.url)),
  "utf8",
);

describe("QuoteBuilderPanel room quick-add source contract", () => {
  it("queues repeated room taps and keeps their selected product line", () => {
    expect(source).toContain("const quickAddQueueRef = useRef<Promise<void>>(Promise.resolve());");
    expect(source).toContain("const run = quickAddQueueRef.current");
    expect(source).toContain("quickAddQueueRef.current = run;");
    expect(source).toContain("const seedProductId = activeTile?.defaultProductId;");
    expect(source).toContain("seed_product_id: seedProductId");
  });

  it("does not disable preset room buttons during a pending save", () => {
    expect(source).toContain(
      'disabled={!activeTile} onClick={() => addWindowWithRoom(room)}>+ {room}</button>',
    );
    expect(source).not.toContain("disabled={busy || !activeTile}");
    expect(source).not.toContain("disabled={isSaving || !activeTile}");
  });

  it("orders queued quick-adds from the latest returned quote", () => {
    expect(source).toContain("quoteRef.current?.lineItems.length ?? 0");
    expect(source).not.toContain("sort_order: quote?.lineItems.length ?? 0");
  });

  it("renders selected option details as tight square boxes", () => {
    expect(source).toContain("const selectedOptionSummaryRow: CSSProperties = {");
    expect(source).toContain("const selectedOptionSummaryBox: CSSProperties = {");
    expect(source).toContain("style={selectedOptionSummaryRow}");
    expect(source).toContain("borderRadius: 0");
    expect(source).toContain("marginLeft: i === 0 ? 0 : -1");
    expect(source).not.toContain('borderRadius: 4, padding: "2px 8px"');
  });

  it("does not render or post the old manual surcharge selector", () => {
    expect(source).not.toContain("Options &amp; upgrades");
    expect(source).not.toContain("toggleSurcharge");
    expect(source).not.toContain("surchargeHint");
    expect(source).not.toContain("surcharges: design.surcharges");
    expect(source).not.toContain("Select surcharge or add-on");
    expect(source).not.toContain("Add Surcharge");
  });
});
