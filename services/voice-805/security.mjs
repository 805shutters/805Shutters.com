import { createHmac, timingSafeEqual } from "node:crypto";
import { Buffer } from "node:buffer";
export const hmac = (key, value, algorithm = "sha256") =>
  createHmac(algorithm, key).update(value).digest("base64");
export function equal(a, b) {
  return (
    typeof a === "string" &&
    typeof b === "string" &&
    Buffer.byteLength(a) === Buffer.byteLength(b) &&
    timingSafeEqual(Buffer.from(a), Buffer.from(b))
  );
}
export function twilioSignature(token, url, params, signature) {
  const payload =
    url +
    [...new Set(params.keys())]
      .sort()
      .map((key) =>
        [...new Set(params.getAll(key))]
          .sort()
          .map((value) => key + value)
          .join(""),
      )
      .join("");
  return !!token && equal(hmac(token, payload, "sha1"), signature);
}
// Twilio signs the Stream url it dials. That url is wss, while the HTTP
// handshake is the same path. Voice WSS validation can also require a trailing
// slash. The public origin is reconstructed so a gateway path rewrite does not
// change the signed URL. Every candidate is checked; a missing signature fails.
export function mediaStreamSignatureUrls(origin, mediaPath) {
  const https = String(origin || "").replace(/\/$/, "") + mediaPath;
  if (!https.startsWith("https://") || !mediaPath.startsWith("/")) return [];
  const wss = `wss://${https.slice("https://".length)}`;
  return [wss, `${wss}/`, https, `${https}/`];
}
export function twilioSignatureMatches(token, urls, params, signature) {
  let ok = false;
  for (const url of urls) ok = twilioSignature(token, url, params, signature) || ok;
  return ok;
}
export function authorizeControl(store, config, req, raw) {
  const at = req.headers["x-805-time"],
    nonce = req.headers["x-805-nonce"],
    actor = req.headers["x-805-actor"];
  if (
    !["mike", "jessica"].includes(actor) ||
    !/^[-\w]{16,80}$/.test(nonce || "") ||
    Math.abs(Date.now() - Number(at)) > 30000 ||
    !Number.isFinite(Number(at))
  )
    return null;
  if (
    !config.controlKey ||
    !equal(
      hmac(
        config.controlKey,
        `${req.method}\n${req.url}\n${at}\n${nonce}\n${actor}\n${raw}`,
      ),
      req.headers["x-805-signature"],
    )
  )
    return null;
  return store.db
    .prepare("INSERT OR IGNORE INTO controls VALUES(?,?)")
    .run(nonce, Date.now()).changes
    ? actor
    : null;
}
export function publicError(error) {
  const errorClass =
    (error && (error.name || error.constructor?.name)) || "Error";
  const message = String(error?.message || "")
    .replace(/Bearer\s+\S+/gi, "Bearer [redacted]")
    .replace(/\b[A-Za-z0-9+/_=-]{32,}\b/g, "[redacted]")
    .slice(0, 300);
  return { errorClass, message };
}
export function reportFailure(where, error) {
  const failure = publicError(error);
  console.error(
    JSON.stringify({ event: "voice-805-failure", where, ...failure }),
  );
  return failure;
}
export function xml(value) {
  return String(value).replace(
    /[<>&"']/g,
    (ch) =>
      ({
        "<": "&lt;",
        ">": "&gt;",
        "&": "&amp;",
        '"': "&quot;",
        "'": "&apos;",
      })[ch],
  );
}
export function twiml(body) {
  return `<?xml version="1.0" encoding="UTF-8"?><Response>${body}</Response>`;
}
