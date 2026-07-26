type HermesDecision = {
  clear: boolean;
  reply: string;
  assessment?: Record<string, unknown>;
  proposedWork?: Record<string, unknown>;
};

type ResponsesBody = {
  output_text?: string;
  output?: Array<{ content?: Array<{ text?: string }> }>;
};

function responseText(body: ResponsesBody) {
  if (typeof body.output_text === "string") return body.output_text;
  return (body.output || [])
    .flatMap((item) => item.content || [])
    .map((part) => part.text || "")
    .join("\n");
}

export async function evaluateFeedbackWithHermes(input: {
  title: string;
  description: string;
  conversation: Array<{ author_type: string; body: string }>;
}): Promise<HermesDecision> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return {
      clear: false,
      reply: "Hermes received this request. Automated clarification is temporarily unavailable, so the request remains pinned for review."
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: process.env.HERMES_FEEDBACK_MODEL || "gpt-5.4-mini",
        instructions: [
          "You are Hermes, the supervised 805 CRM implementation agent.",
          "Evaluate Jessica's CRM troubleshooting or change request.",
          "If intent, desired outcome, affected workflow, or acceptance criteria are unclear, ask at most three focused questions.",
          "If it is actionable, provide a concrete assessment and proposed work, but do not claim it is built and do not authorize implementation or deployment.",
          "Return JSON only with keys clear (boolean), reply (string), assessment (object or null), proposedWork (object or null).",
          "The assessment should include problem, desiredOutcome, affectedArea, acceptanceCriteria, risks.",
          "The proposedWork should include summary, implementationSteps, verificationPlan, deploymentNotes."
        ].join("\n"),
        input: JSON.stringify(input),
        max_output_tokens: 1400
      }),
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`Hermes model error ${response.status}`);
    const raw = responseText(await response.json() as ResponsesBody).trim()
      .replace(/^```json\s*/i, "")
      .replace(/```$/i, "");
    const parsed = JSON.parse(raw) as HermesDecision;
    if (typeof parsed.clear !== "boolean" || typeof parsed.reply !== "string") {
      throw new Error("Hermes returned an invalid assessment");
    }
    return parsed;
  } catch (error) {
    console.error("Hermes feedback evaluation failed", error);
    return {
      clear: false,
      reply: "Hermes could not complete the automated assessment. This request remains pinned and needs Hermes review."
    };
  } finally {
    clearTimeout(timeout);
  }
}
