export const NORMAN_ORDER_BRIDGE_URL = "http://127.0.0.1:47635";
export const NORMAN_ORDER_TASK_ID_PATTERN = /^[a-zA-Z0-9:_-]{8,180}$/;

export function normanOrderBridgeLaunchUrl(taskId: string) {
  const normalizedTaskId = taskId.trim();
  if (!NORMAN_ORDER_TASK_ID_PATTERN.test(normalizedTaskId)) {
    throw new Error("The queued Norman order task identifier is invalid.");
  }
  const url = new URL("/start", NORMAN_ORDER_BRIDGE_URL);
  url.searchParams.set("taskId", normalizedTaskId);
  return url.toString();
}
