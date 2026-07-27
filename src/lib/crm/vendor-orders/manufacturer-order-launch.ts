import type { OrderFormManufacturer } from "./manufacturer-order-form-registry";

export const MANUFACTURER_ORDER_BRIDGE_URL = "http://127.0.0.1:47635";
export const MANUFACTURER_ORDER_TASK_ID_PATTERN = /^[a-zA-Z0-9:_-]{8,180}$/;

export const MANUFACTURER_ORDER_QUEUE_URLS: Record<OrderFormManufacturer, string> = {
  onyx: "https://admin.onyxshutters.com/OrderList.aspx",
  norman: "https://www.normanwindowcoverings.com/Login/default.asp",
  lotus: "https://www.lotusblind.com/",
  polar: "https://polarshades.picbusiness.com/",
};

export function manufacturerOrderBridgeLaunchUrl(input: {
  taskId: string;
  manufacturer: string;
}) {
  const taskId = input.taskId.trim();
  const manufacturer = input.manufacturer.trim().toLowerCase() as OrderFormManufacturer;
  if (!MANUFACTURER_ORDER_TASK_ID_PATTERN.test(taskId)) {
    throw new Error("The queued manufacturer-order task identifier is invalid.");
  }
  if (!Object.prototype.hasOwnProperty.call(MANUFACTURER_ORDER_QUEUE_URLS, manufacturer)) {
    throw new Error("The manufacturer ordering queue is not configured.");
  }
  const url = new URL("/start", MANUFACTURER_ORDER_BRIDGE_URL);
  url.searchParams.set("taskId", taskId);
  url.searchParams.set("manufacturer", manufacturer);
  return url.toString();
}
