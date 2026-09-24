/** Reject truncated successful responses before they replace a working CRM snapshot. */
export async function readCrmResponse(response: Response, path: string, method = "GET"): Promise<Record<string, unknown>> {
  const body = await response.json().catch(() => null);
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('CRM returned an incomplete response. The previous data has been kept; refresh to try again.');
  if (response.ok && method.toUpperCase() === "GET" && /^\/api\/crm\/jobs\/?$/.test(path) && (!body.summary || !Array.isArray(body.jobs) || !Array.isArray(body.quotes) || !Array.isArray(body.bookkeepingRows))) {
    throw new Error('CRM returned an incomplete dashboard. The previous data has been kept; refresh to try again.');
  }
  return body;
}
