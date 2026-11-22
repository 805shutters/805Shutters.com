// @vitest-environment happy-dom
// @vitest-environment-options {"happyDOM":{"settings":{"disableJavaScriptFileLoading":true,"handleDisabledFileLoadingAsSuccess":true}}}
import { afterEach, expect, it } from "vitest";
import { googleTagLoader } from "./google-tag-loader";

afterEach(() => { document.head.innerHTML = ""; });

it("reuses a Google library already loaded by GTM", () => {
  const script = document.createElement("script");
  script.src = "https://www.googletagmanager.com/gtag/js?id=G-EXISTING&cx=c";
  document.head.appendChild(script);
  new Function(googleTagLoader("G-FALLBACK"))();
  expect(document.scripts.length).toBe(1);
});

it("loads a fallback once when GTM has not loaded the library", () => {
  new Function(googleTagLoader("G-FALLBACK"))();
  new Function(googleTagLoader("G-FALLBACK"))();
  expect(document.scripts.length).toBe(1);
  expect(document.scripts[0].src).toBe("https://www.googletagmanager.com/gtag/js?id=G-FALLBACK");
  expect(document.scripts[0].async).toBe(true);
});
