import assert from "node:assert/strict";
import test from "node:test";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import { auditPublicSite, extractFeedUrls, machineFeedPaths } from "./public-site-integrity.mjs";

test("extracts Markdown URL labels without their closing brackets and nested JSON paths", () => {
  assert.deepEqual(extractFeedUrls("- Intent: [https://www.805shutters.com/blinds/](https://www.805shutters.com/blinds/) - Note", false), ["https://www.805shutters.com/blinds/"]);
  assert.deepEqual(extractFeedUrls(JSON.stringify({ nested: [{ citationPath: "/" }, { url: "/drapery/" }] }), true), ["/", "/drapery/"]);
});

for (const [href, status] of [["/motorized", 301], ["/missing-page/", 404], ["http://805shutters.com/blinds/", 200]]) {
  test(`detects a bad internal anchor: ${href}`, async () => {
    const request = async (url) => {
      if (machineFeedPaths.includes(url.pathname)) return new Response(url.pathname.endsWith(".json") ? "{}" : "");
      if (url.pathname === "/sitemap.xml") return new Response('<urlset><url><loc>https://www.805shutters.com/blinds/</loc></url></urlset>');
      if (url.pathname === "/blinds/") return new Response(`<link rel="canonical" href="https://www.805shutters.com/blinds/"><a href="${href}">Existing wording</a>`);
      return new Response("", { status });
    };
    const result = await auditPublicSite("http://127.0.0.1:3000", request);
    assert.equal(result.issues.length, 1);
    assert.equal(result.issues[0].href, href);
  });
}

for (const path of machineFeedPaths) {
  for (const status of [301, 308, 404, 503]) {
    test(`detects HTTP ${status} in ${path}, including nested citation paths`, async () => {
      const requests = [];
      const request = async (url, options) => {
        requests.push(url);
        assert.equal(options.redirect, "manual");
        if (url.pathname === "/sitemap.xml") return new Response('<urlset><url><loc>https://www.805shutters.com/blinds/</loc></url></urlset>');
        if (url.pathname === "/blinds/") return new Response('<link rel="canonical" href="https://www.805shutters.com/blinds/">');
        if (url.pathname === path) return new Response(path.endsWith(".json")
          ? JSON.stringify({ answers: [{ citationPath: "/old-page/" }], profiles: ["https://example.com/profile"] })
          : "[Citation](https://www.805shutters.com/old-page/)\nhttps://example.com/profile");
        if (machineFeedPaths.includes(url.pathname)) return new Response(url.pathname.endsWith(".json") ? "{}" : "");
        return new Response("", { status, headers: { Location: "https://www.805shutters.com/blinds/" } });
      };
      const result = await auditPublicSite("http://127.0.0.1:3000", request);
      assert.equal(result.issues.length, 1);
      assert.equal(result.issues[0].source, `https://www.805shutters.com${path}`);
      assert.equal(result.issues[0].reason, `HTTP ${status}`);
      assert.ok(requests.every((url) => url.origin === "http://127.0.0.1:3000"));
      assert.ok(!requests.some((url) => url.pathname === "/profile"));
    });
  }
}

test("every built sitemap page and AI feed links directly to a 200 URL", { timeout: 180000 }, async () => {
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
    assert.equal(result.feeds.length, 4);
    assert.ok(result.feeds.every((feed) => feed.internalUrlCount > 0));
    console.log(`Audited ${result.pages.length} sitemap pages and ${result.feeds.length} AI feeds; ${result.targetCount} unique targets. Explicit protected exceptions: ${JSON.stringify(result.exceptions)}`);
  } finally {
    const stopped = new Promise((resolve) => server.once("exit", resolve));
    server.kill("SIGTERM");
    await Promise.race([stopped, delay(3000)]);
    if (server.exitCode === null) server.kill("SIGKILL");
  }
});
