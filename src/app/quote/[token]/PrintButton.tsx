"use client";

export function PrintButton() {
  return (
    <button
      type="button"
      className="no-print"
      onClick={() => window.print()}
      style={{ border: "1px solid #d8d8d2", background: "#ffffff", borderRadius: 8, padding: "8px 16px", cursor: "pointer", fontSize: 14 }}
    >
      Print / Save as PDF
    </button>
  );
}
