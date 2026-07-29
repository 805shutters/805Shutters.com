import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("src/components/crm/CrmApp.tsx", "utf8");
const styles = readFileSync("src/app/globals.css", "utf8");
const tableStart = source.indexOf("function JessicaJobLedgerTable");
const tableEnd = source.indexOf("function sumPartnerRemaining", tableStart);
const tableSource = source.slice(tableStart, tableEnd);

describe("Jessica payables row layout", () => {
  it("puts Jessica's remaining payable first with the payability state beside it", () => {
    expect(tableSource.indexOf("<th className=\"crm-jessica-owed-column\">Jessica Owed</th>")).toBeLessThan(
      tableSource.indexOf("<th>Customer</th>")
    );
    expect(tableSource).toContain("<strong>{toLedgerCurrency(item.remainingAmount)}</strong>");
    expect(tableSource).toContain("<span>{jobPaymentStateDisplay(item)}</span>");
    expect(styles).toContain(".crm-jessica-job-ledger .crm-jessica-owed-column");
    expect(styles).toContain("position: sticky");
  });

  it("places the requested cost and Mike-profit breakdown after Jessica's amount", () => {
    const owed = tableSource.indexOf("Jessica Owed");
    for (const heading of ["Ken Payoff", "COGS", "Installation", "Other Costs", "Mike Profit"]) {
      expect(tableSource.indexOf(`<th>${heading}</th>`)).toBeGreaterThan(owed);
    }
    expect(tableSource).toContain("item.expensesTotal + item.remakeTotal");
    expect(tableSource).toContain("toLedgerCurrency(item.mikeProfit)");
  });
});
