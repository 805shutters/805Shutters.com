import type { CrmCustomerContract } from "./types";

/** Internal purchasing artifacts share storage with customer contracts. */
export function isVendorOrderPacketUrl(value: string | null | undefined): boolean {
  if (!value) return false;
  try {
    const url = new URL(value, "https://www.805shutters.com");
    const internal = ["805shutters.com", "www.805shutters.com", "805-one.vercel.app"].includes(url.hostname);
    return internal && /^\/api\/crm\/vendor-order-packets(?:\/|$)/.test(url.pathname);
  } catch {
    return false;
  }
}

export function isCustomerContractDocument(contract: Pick<CrmCustomerContract, "meta" | "contract_url">): boolean {
  return !["bookkeeping_row", "manufacturer_order_manifest", "manufacturer_order_packet"].includes(String(contract.meta?.source))
    && !isVendorOrderPacketUrl(contract.contract_url);
}
