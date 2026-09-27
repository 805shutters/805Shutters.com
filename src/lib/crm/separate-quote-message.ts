type SeparateQuote = { label: string; url: string; total: number };
const money = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
const escape = (value: string) => value.replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
export function buildSeparateQuotesSms(quotes: SeparateQuote[]): string {
  return `805 Shutters: Your separate quotes are ready.\n${quotes.map(quote => `Quote ${quote.label}: ${money(quote.total)}\n${quote.url}`).join("\n\n")}`;
}
export function buildSeparateQuotesEmail(customer: string, quotes: SeparateQuote[], note?: string | null) {
  const text = `Hi ${customer},${note ? `\n\n${note}` : ""}\n\nYour ${quotes.length} separate quotes from 805 Shutters are ready. Each link opens only that quote, with its own items and total.\n\n${quotes.map(quote => `Quote ${quote.label} — ${money(quote.total)}\nReview quote: ${quote.url}`).join("\n\n")}\n\nThank you,\n805 Shutters`;
  const html = `<div style="font-family:Arial,sans-serif;max-width:640px;color:#0b0b0b;background:white"><h1>Your separate quotes</h1><p>Hi ${escape(customer)},</p>${note ? `<p>${escape(note).replace(/\n/g,"<br>")}</p>` : ""}<p>Each quote has its own items and total. Review each quote separately.</p>${quotes.map(quote => `<section style="padding:20px;border:1px solid #ddd;margin:16px 0"><h2>Quote ${escape(quote.label)}</h2><p>${money(quote.total)}</p><a href="${escape(quote.url)}">Review Quote ${escape(quote.label)}</a></section>`).join("")}<p>Thank you,<br>805 Shutters</p></div>`;
  return { subject: `Your ${quotes.length} separate 805 Shutters quotes`, text, html };
}
