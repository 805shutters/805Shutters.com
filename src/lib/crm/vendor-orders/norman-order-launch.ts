export const NORMAN_ORDER_BRIDGE_URL = "http://127.0.0.1:47635";

export function normanOrderBridgeLaunchUrl(taskId: string) {
  const normalizedTaskId = taskId.trim();
  if (!/^[a-zA-Z0-9_-]{8,120}$/.test(normalizedTaskId)) {
    throw new Error("The queued Norman order task identifier is invalid.");
  }
  const url = new URL("/start", NORMAN_ORDER_BRIDGE_URL);
  url.searchParams.set("taskId", normalizedTaskId);
  return url.toString();
}
