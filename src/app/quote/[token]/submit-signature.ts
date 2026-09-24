export type SignatureSubmission = {
  printedName: string;
  signature: string;
  acknowledgedTotal: number;
  selectedLineIds?: string[];
};

export class SignatureSubmissionError extends Error {
  constructor(message: string, public status?: number) { super(message); }
}

async function timedFetch(url: string, init: RequestInit, timeout: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    const body = await response.json().catch(() => null);
    return { response, body };
  }
  finally { clearTimeout(timer); }
}

export async function submitSignature(token: string, input: SignatureSubmission): Promise<void> {
  const url = `/api/quote/${encodeURIComponent(token)}/accept`;
  try {
    const { response, body } = await timedFetch(url, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input),
    }, 30_000);
    if (!response.ok) {
      throw new SignatureSubmissionError(body?.message || "We couldn't confirm your signature. Please try again.", response.status);
    }
    if (body?.ok !== true || typeof body.alreadySigned !== "boolean") {
      throw new SignatureSubmissionError("We couldn't confirm your signature. Please try again.");
    }
    return;
  } catch (error) {
    // A rejected contract must be reviewed; an interrupted response may have
    // committed successfully. The status check is strictly read-only.
    if (error instanceof SignatureSubmissionError && error.status && error.status < 500) throw error;
    try {
      const { response, body: status } = await timedFetch(url, { method: "GET", cache: "no-store" }, 8_000);
      if (response.ok && status?.signed === true && typeof status.signedAt === "string" && status.signedAt) return;
    } catch { /* Retain the form and allow a safe idempotent retry. */ }
    throw new SignatureSubmissionError("We couldn't confirm your signature. Check your connection and try again. Your name and selections are still here.");
  }
}
