import { isMarketingTrackingPath } from "./marketing-tracking";

export const metaOrigin = "https://www.805shutters.com";
export const clickIdPattern = /^[A-Za-z0-9_-]{1,500}$/;

export function marketingPath(value: unknown) {
  if (typeof value !== "string" || !/^\/(?![\/\\])/.test(value) || value.length > 2048) return;
  const url = new URL(value, metaOrigin);
  if (url.origin === metaOrigin && isMarketingTrackingPath(url.pathname)) return url.pathname;
}
