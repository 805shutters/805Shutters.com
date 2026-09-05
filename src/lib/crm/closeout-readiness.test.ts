import { it, expect } from "vitest";
import { assertCloseoutReady } from "./closeout-readiness";
import type { JobProgress } from "./job-progress";
const complete = {
  commercial: "accepted",
  installation: "complete",
  service: "none_known",
  payment: "settled",
  stage: "complete",
  confidence: "confirmed",
} as JobProgress;
it("blocks a completed parent when another purchased order is unfinished or unsettled", () => {
  expect(() =>
    assertCloseoutReady(
      [complete, { ...complete, installation: "partial" }],
      "805shutters@gmail.com",
    ),
  ).toThrow("every purchased");
  expect(() =>
    assertCloseoutReady(
      [complete, { ...complete, payment: "balance_open" }],
      "805shutters@gmail.com",
    ),
  ).toThrow();
  expect(() =>
    assertCloseoutReady(
      [complete, { ...complete, service: "open" }],
      "805shutters@gmail.com",
    ),
  ).toThrow();
  expect(() =>
    assertCloseoutReady([complete], "805shutters@gmail.com"),
  ).not.toThrow();
});
it("requires confirmed evidence or an attributed owner exception", () => {
  expect(() =>
    assertCloseoutReady(
      [{ ...complete, confidence: "needs_verification" }],
      "805shutters@gmail.com",
    ),
  ).toThrow();
  expect(() =>
    assertCloseoutReady(
      [],
      "jessica@805shutters.com",
      "Outstanding issue accepted for review",
    ),
  ).toThrow("Only Mike");
  expect(() =>
    assertCloseoutReady(
      [],
      "805shutters@gmail.com",
      "Outstanding issue remains in attention queue",
    ),
  ).not.toThrow();
});
