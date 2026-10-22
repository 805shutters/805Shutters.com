import type { CSSProperties } from "react";
import type { PublicQuoteLine } from "@/lib/crm/public-quote";

const money = (amount: number) => amount.toLocaleString("en-US", { style: "currency", currency: "USD" });
const cell: CSSProperties = { padding: "12px 10px", borderBottom: "1px solid #d8d8d2", verticalAlign: "top", textAlign: "left" };
const amountCell: CSSProperties = { ...cell, textAlign: "right", whiteSpace: "nowrap" };

export function CommercialQuoteSchedule({ lines, selected, selectionEnabled, disabled, onToggle }: {
  lines: PublicQuoteLine[];
  selected: ReadonlySet<string>;
  selectionEnabled: boolean;
  disabled: boolean;
  onToggle: (id: string) => void;
}) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table aria-label="Commercial item schedule" style={{ width: "100%", minWidth: 620, borderCollapse: "collapse", fontSize: 13 }}>
        <thead style={{ background: "#f4f4f2", fontSize: 11, textTransform: "uppercase" }}>
          <tr><th scope="col" style={cell}>Location</th><th scope="col" style={cell}>Specification</th><th scope="col" style={amountCell}>Qty</th><th scope="col" style={amountCell}>Unit</th><th scope="col" style={amountCell}>Amount</th></tr>
        </thead>
        <tbody>
          {lines.map((line, index) => {
            const configurations = line.priceReady && line.showDesignOptions && line.designOptions.length ? line.designOptions : [line];
            return (
              <tr key={line.id} style={{ opacity: selectionEnabled && !selected.has(line.id) ? .4 : 1 }}>
                <td style={cell}><strong>{line.room}</strong>{selectionEnabled ? <label style={{ display: "flex", gap: 6, marginTop: 8 }}><input type="checkbox" checked={selected.has(line.id)} disabled={disabled} onChange={() => onToggle(line.id)} aria-label={`Select item ${index + 1}: ${line.room}`} />Select item</label> : null}</td>
                <td style={cell}>{configurations.map(configuration => <div key={configuration.id} style={{ marginBottom: 8 }}><strong>{configuration.productName}</strong>{configuration.styleName ? <div>{configuration.styleName}</div> : null}{line.priceReady ? configuration.options.map((option, optionIndex) => <div key={`${optionIndex}-${option}`}>{option}</div>) : null}</div>)}</td>
                <td style={amountCell}>{line.quantity}</td>
                <td style={amountCell}>{line.priceReady ? money(line.unitPrice) : "—"}</td>
                <td style={amountCell}><strong>{line.priceReady ? money(line.lineTotal) : "Pricing in progress"}</strong></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
