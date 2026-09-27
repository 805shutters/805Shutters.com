import { describe, expect, it } from "vitest";
import { selectedDeliveryQuoteIds, selectDeliveryQuotes } from "./quote-delivery-selection";
import { buildSeparateQuotesEmail, buildSeparateQuotesSms } from "./separate-quote-message";
const active = { id: "a", quote_group_id: "project", account_id: "805", status: "draft" };
describe("separate quote selection", () => {
 it("defaults only to the current quote", () => expect(selectedDeliveryQuoteIds("a", {})).toEqual(["a"]));
 it("requires explicit multiple approval", () => expect(() => selectedDeliveryQuoteIds("a", { selectedQuoteIds: ["a", "c"] })).toThrow("Approve sending multiple"));
 it.each([["c"], ["a", "a"], []])("rejects invalid selection %j", (...ids) => expect(() => selectedDeliveryQuoteIds("a", { selectedQuoteIds: ids, multipleQuotesApproved: true })).toThrow());
 it("selects A and C without including B or D", () => { const group = ["b", "c", "d"].map(id => ({ ...active, id })); expect(selectDeliveryQuotes(active, group, ["a", "c"]).map(q => q.id)).toEqual(["a", "c"]); });
 it.each([{ account_id: "other" }, { quote_group_id: "other" }, { status: "archived" }, { archived_at: "2026-09-27" }])("rejects unavailable or unrelated selections", patch => expect(() => selectDeliveryQuotes(active, [{ ...active, id: "b", ...patch }], ["a", "b"])).toThrow());
 it("renders only individual totals and links, escaping customer content", () => {
  const quotes = [{ label: "A", url: "https://www.805shutters.com/q/a", total: 100 }, { label: "C", url: "https://www.805shutters.com/q/c", total: 200 }];
  const mail = buildSeparateQuotesEmail("<Customer>", quotes, "<script>bad</script>");
  for (const body of [mail.text, mail.html, buildSeparateQuotesSms(quotes)]) { expect(body).toContain("$100.00"); expect(body).toContain("$200.00"); expect(body).not.toContain("$300.00"); expect(body).not.toContain("/q/b"); expect(body).not.toContain("/q/d"); }
  expect(mail.html).not.toContain("<script>"); expect(mail.html).toContain("&lt;Customer&gt;");
 });
});
