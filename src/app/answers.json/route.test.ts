import { describe, expect, it } from "vitest";
import { GET } from "./route";

describe("/answers.json", () => {
  it("returns canonical answer snippets for AI citation", async () => {
    const response = GET();
    const payload = await response.json();

    expect(response.headers.get("content-type")).toContain("application/json");
    expect(payload).toMatchObject({
      schemaVersion: "805-answer-citations/v1",
      publisher: {
        name: "805 Shutters",
        serviceArea: "Ventura County"
      }
    });
    expect(payload.answerCount).toBe(payload.answers.length);
    expect(payload.answerCount).toBeGreaterThanOrEqual(24);
    expect(payload.sourcePages.length).toBeGreaterThanOrEqual(6);
    expect(payload.answers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          question: "What are the best window treatments for Ventura County homes?",
          answerType: "direct-answer",
          citationUrl: "https://www.805shutters.com/best-window-treatments-ventura-county/"
        }),
        expect.objectContaining({
          question: "Who installs commercial roller shades in Ventura County?",
          citationUrl: "https://www.805shutters.com/commercial-roller-shades-ventura-county/"
        })
      ])
    );
    expect(payload.answers.every((answer: { citationPath: string }) => !answer.citationPath.startsWith("/api/"))).toBe(
      true
    );
  });
});
