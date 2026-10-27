"use client";

import { useState } from "react";
import type { ItemsPerPage } from "./ContractPrintItems";

export function PrintButton({ itemsPerPage = 2, onItemsPerPageChange, showLayout = true }: {
  itemsPerPage?: ItemsPerPage;
  onItemsPerPageChange?: (value: ItemsPerPage) => void;
  showLayout?: boolean;
}) {
  const [preparing, setPreparing] = useState(false);
  const [error, setError] = useState(false);
  const print = async () => {
    setPreparing(true);
    setError(false);
    try {
      await document.fonts?.ready;
      const images = [...document.querySelectorAll<HTMLImageElement>(".customer-contract-print-root img")];
      await Promise.all(images.map(image => { image.loading = "eager"; return image.decode(); }));
      window.print();
    } catch {
      setError(true);
    } finally {
      setPreparing(false);
    }
  };
  return <div className="no-print" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10 }}>
    {showLayout && <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14 }}>
      Print layout
      <select aria-label="Items per printed page" value={itemsPerPage} onChange={event => onItemsPerPageChange?.(Number(event.target.value) as ItemsPerPage)} style={control}>
        <option value={1}>1 item per page</option>
        <option value={2}>2 items per page</option>
      </select>
    </label>}
    <button type="button" onClick={print} disabled={preparing} style={control}>{preparing ? "Preparing print…" : "Print / Save as PDF"}</button>
    {showLayout && <small style={{ fontSize: 12 }}>Choose 1 item per page for larger text or items with several options.</small>}
    {error && <span role="alert" style={{ fontSize: 13 }}>An illustration could not load. Please reload the contract and try again.</span>}
  </div>;
}

const control = { border: "1px solid #d8d8d2", background: "#ffffff", color: "#0b0b0b", borderRadius: 8, padding: "8px 12px", minHeight: 44, maxWidth: "100%", cursor: "pointer", fontSize: 14 } as const;
