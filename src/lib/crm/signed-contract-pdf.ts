import type { SignedContractSnapshot } from "./public-quote";
import { contractRenderAuthorization, contractSnapshotDigest } from "./signed-contract-render-auth";

/** Print the SAME Next.js document and styles used by the customer contract UI.
 * Never fall back to rebuilding a text-only substitute. */
export async function buildSignedContractPdf(snapshot: SignedContractSnapshot, outboxId: string): Promise<Buffer> {
  const secret = process.env.CRON_SECRET;
  if (!secret) throw new Error("Contract PDF authorization is unavailable.");
  const origin = process.env.NODE_ENV === "development"
    ? "http://127.0.0.1:3000" : "https://www.805shutters.com";
  const url = `${origin}/quote/contract-copy/${encodeURIComponent(outboxId)}/`;
  const digest = contractSnapshotDigest(snapshot);
  const expires = Date.now() + 240_000;
  const { default: puppeteer } = await import("puppeteer-core");
  const { default: chromium } = await import("@sparticuz/chromium");
  const browser = await puppeteer.launch({
    ...(process.platform === "linux" ? { args: chromium.args, executablePath: await chromium.executablePath(), headless: "shell" as const }
      : { channel: "chrome" as const, headless: true }),
    defaultViewport: { width: 1280, height: 900 },
  });
  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(30_000);
    await page.setRequestInterception(true);
    page.on("request", request => {
      const target = new URL(request.url());
      // No tracking, payment requests, third-party services, or credential forwarding.
      if (target.origin !== origin && target.protocol !== "data:") { void request.abort(); return; }
      if (request.isNavigationRequest() && request.frame() === page.mainFrame()) {
        if (request.url() !== url) { void request.abort(); return; }
        void request.continue({ headers: { ...request.headers(),
          "x-contract-digest": digest, "x-contract-expires": String(expires),
          "x-contract-proof": contractRenderAuthorization(outboxId, digest, expires, secret),
        } });
      } else if (request.method() === "GET") void request.continue();
      else void request.abort();
    });
    const response = await page.goto(url, { waitUntil: "networkidle0", timeout: 60_000 });
    if (!response?.ok()) throw new Error("The original signed contract document could not be loaded.");
    await page.waitForSelector(`[data-contract-digest="${digest}"] .customer-contract-print-root`);
    await page.emulateMediaType("print");
    await page.evaluate(async () => {
      await document.fonts.ready;
      const root = document.querySelector(".customer-contract-print-root");
      if (!root) throw new Error("Contract document is missing.");
      const images = Array.from(root.querySelectorAll("img"));
      for (const image of images) { image.loading = "eager"; await image.decode(); }
      if (!images.length || images.some(image => !image.naturalWidth)) throw new Error("Contract illustrations failed to load.");
    });
    const bytes = await page.pdf({ format: "Letter", printBackground: true, preferCSSPageSize: true,
      displayHeaderFooter: false, margin: { top: "0.35in", bottom: "0.35in", left: "0.35in", right: "0.35in" }, timeout: 30_000 });
    if (bytes.length < 10_000) throw new Error("The signed contract PDF is incomplete.");
    return Buffer.from(bytes);
  } finally { await browser.close(); }
}
