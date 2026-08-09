export function legacyShareTokenPatch(value: unknown): { share_token: string } | Record<string, never> {
  if (typeof value !== "string") return {};
  const shareToken = value.trim();
  return shareToken ? { share_token: shareToken } : {};
}
