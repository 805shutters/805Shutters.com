import { createHmac, timingSafeEqual } from "node:crypto";
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
