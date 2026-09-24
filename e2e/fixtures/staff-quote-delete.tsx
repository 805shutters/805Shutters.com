import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { StaffQuoteDesk } from "../../src/components/crm/quotes/StaffQuoteDesk";
import type { QuoteTableRow } from "../../src/mts-quote/components/crm/quote-builder/QuotesTable";

const initial: QuoteTableRow[] = [
  { id: "sold", source: "sales", customer_name: "Example Customer", quote_number: "805-0291", status: "sold", total_amount: 5275.44 },
  { id: "draft", source: "sales", customer_name: "Example Customer", quote_number: "805-0395", status: "draft", total_amount: 0 },
  { id: "alternative", source: "sales", customer_name: "Example Customer", quote_number: "805-0396", status: "draft", pendingAlternative: true, total_amount: 100 },
];
function Fixture() {
  const [quotes, setQuotes] = useState(initial);
  const [fail, setFail] = useState(false);
  const [requests, setRequests] = useState(0);
  return <main style={{ padding: 24 }}>
    <StaffQuoteDesk quotes={quotes} isLoading={false} isError={false} isFetching={false} onRetry={() => {}} onOpen={() => {}} onNewQuote={() => {}} onOpenTools={() => {}} onDelete={async quote => {
      setRequests(value => value + 1);
      await new Promise(resolve => setTimeout(resolve, 300));
      if (fail) throw new Error("Quote could not be deleted. Please try again.");
      setQuotes(rows => rows.filter(row => row.id !== quote.id));
    }} />
    <label style={{ color: "white" }}><input type="checkbox" checked={fail} onChange={e => setFail(e.target.checked)} />Simulate failure</label>
    <output style={{ color: "white" }} aria-label="Delete requests">{requests}</output>
  </main>;
}
createRoot(document.getElementById("root")!).render(<Fixture />);
