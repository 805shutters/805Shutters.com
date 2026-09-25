import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import config from "../next.config.mjs";

const require = createRequire(import.meta.url);
const loadCustomRoutes = require("next/dist/lib/load-custom-routes").default;
const { buildCustomRoute } = require("next/dist/lib/build-custom-route");
const compile = (routes) => routes.map((route) => buildCustomRoute("redirect", route));
const { redirects } = await loadCustomRoutes({ ...config });
const compiled = compile(redirects);
const baseline = compile((await loadCustomRoutes({
  ...config,
  skipTrailingSlashRedirect: false,
  redirects: async () => []
})).redirects);

for (const [source, target] of [
  ["motorized", "motorized-window-shades-ventura-county"],
  ["curtains", "drapery"],
  ["drapes", "drapery"],
  ["shutters/fillmore", "shutters"],
  ["blinds/fillmore-ca", "blinds"],
  ["blinds/moorpark-ca", "blinds"],
  ["blinds/oak-park-ca", "blinds"],
  ["drapery/oak-park-ca", "drapery"],
  ["shutters/santa-paula", "shutters"],
  ["shades/santa-paula-ca", "shades"],
  ["shades/simi-valley-ca", "shades"],
  ["blinds/thousand-oaks-ca", "blinds"],
  ["custom-drapery-curtains-ventura-county", "drapery"]
]) {
  for (const slash of ["", "/"]) {
    test(`/${source}${slash} goes straight to the final HTTPS www URL with 301`, () => {
      // Use Next.js's compiled order, including any automatic slash redirects.
      const first = compiled.find((route) => new RegExp(route.regex).test(`/${source}${slash}`));
      assert.equal(first.statusCode, 301);
      assert.equal(first.destination, `https://www.805shutters.com/${target}/`);
      assert.equal(first.has, undefined, "Must precede host canonicalization on every host");
    });
  }
  test(`/${source} does not capture child routes or similar names`, () => {
    const rule = compiled.find((route) => route.source === `/${source}`);
    for (const path of [`/${source}-example`, `/${source}/example`]) {
      assert.equal(new RegExp(rule.regex).test(path), false);
    }
  });
}

for (const path of [
  "/", "/about", "/about/", "/shutters/plantation", "/shutters/plantation/",
  "/drapery", "/drapery/", "/motorized-window-shades-ventura-county/",
  "/api/example", "/api/example/", "/robots.txt", "/robots.txt/",
  "/images/example.jpg/", "/.well-known/example", "/.well-known/example/",
  "/.well-known/example.json/"
]) {
  test(`existing slash normalization is preserved for ${path}`, () => {
    const original = baseline.find((route) => new RegExp(route.regex).test(path));
    const replacement = compiled.find((route) =>
      ["/:file", "/:notfile/"].includes(route.destination) && new RegExp(route.regex).test(path)
    );
    assert.equal(replacement?.destination, original?.destination);
    assert.equal(replacement?.statusCode, original?.statusCode);
    assert.deepEqual(replacement?.missing, original?.missing);
  });
}
