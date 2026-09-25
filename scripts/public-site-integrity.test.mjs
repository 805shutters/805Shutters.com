import assert from "node:assert/strict";
import test from "node:test";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import { auditPublicSite } from "./public-site-integrity.mjs";

for (const [href, status] of [["/motorized", 301], ["/missing-page/", 404], ["http://805shutters.com/blinds/", 200]]) {
  test(`detects a bad internal anchor: ${href}`, async () => {
    const request = async (url) => {
      if (url.pathname === "/sitemap.xml") return new Response('<urlset><url><loc>https://www.805shutters.com/blinds/</loc></url></urlset>');
      if (url.pathname === "/blinds/") return new Response(`<link rel="canonical" href="https://www.805shutters.com/blinds/"><a href="${href}">Existing wording</a>`);
      return new Response("", { status });
    };
    const result = await auditPublicSite("http://127.0.0.1:3000", request);
    assert.equal(result.issues.length, 1);
    assert.equal(result.issues[0].href, href);
  });
}

test("every built sitemap page has direct internal links and a self-referencing canonical", { timeout: 180000 }, async () => {
  const socket = createServer();
  await new Promise((resolve) => socket.listen(0, "127.0.0.1", resolve));
  const port = socket.address().port;
  await new Promise((resolve) => socket.close(resolve));
  const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", String(port)], { stdio: ["ignore", "pipe", "pipe"] });
  let output = "";
  server.stdout.on("data", (data) => { output += data; });
  server.stderr.on("data", (data) => { output += data; });
  const base = `http://127.0.0.1:${port}`;
  try {
    let ready = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      if (server.exitCode !== null) throw new Error(`Next server exited: ${output}`);
      try {
        const response = await fetch(`${base}/sitemap.xml`, { signal: AbortSignal.timeout(1000) });
        await response.body?.cancel();
        ready = response.status === 200;
      } catch { /* Wait for the production server to listen. */ }
      if (ready) break;
      await delay(100);
    }
    assert.ok(ready, `Next server did not become ready: ${output}`);
    const result = await auditPublicSite(base);
    assert.equal(result.issues.length, 0, JSON.stringify(result.issues, null, 2));
    console.log(`Audited ${result.pages.length} sitemap pages; ${result.targetCount} unique targets. Explicit protected exceptions: ${JSON.stringify(result.exceptions)}`);
  } finally {
    const stopped = new Promise((resolve) => server.once("exit", resolve));
    server.kill("SIGTERM");
    await Promise.race([stopped, delay(3000)]);
    if (server.exitCode === null) server.kill("SIGKILL");
  }
});
