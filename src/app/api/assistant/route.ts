import { NextRequest, NextResponse } from "next/server";
import {
  buildAssistantKnowledge,
  buildLocalAssistantReply,
  isSchedulingQuestion,
  redactPersonalDetails,
  type AssistantKnowledgeContext,
  type AssistantMessage
} from "@/lib/assistant/knowledge";
import { site } from "@/lib/site-data";

export const runtime = "nodejs";

type AssistantRequest = {
  messages?: AssistantMessage[];
  pagePath?: string;
};

type OpenAIResponseBody = {
  output_text?: unknown;
  output?: unknown;
};

const requestBuckets = new Map<string, { count: number; resetAt: number }>();

function cleanText(value: unknown) {
  return typeof value === "string" ? value.trim().slice(0, 1200) : "";
}

function sanitizeMessages(messages: unknown) {
  if (!Array.isArray(messages)) return [];

  return messages
    .map((message): AssistantMessage | null => {
      if (!message || typeof message !== "object") return null;
      const candidate = message as Partial<AssistantMessage>;
      const role = candidate.role === "assistant" ? "assistant" : candidate.role === "user" ? "user" : null;
      const content = cleanText(candidate.content);
      if (!role || !content) return null;
      return { role, content };
    })
    .filter((message): message is AssistantMessage => Boolean(message))
    .slice(-8);
}

function clientKey(request: NextRequest) {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "local"
  );
}

function checkRateLimit(key: string) {
  const now = Date.now();
  const current = requestBuckets.get(key);

  if (!current || current.resetAt < now) {
    requestBuckets.set(key, { count: 1, resetAt: now + 60_000 });
    return true;
  }

  if (current.count >= 20) return false;
  current.count += 1;
  return true;
}

export async function POST(request: NextRequest) {
  if (!checkRateLimit(clientKey(request))) {
    return NextResponse.json(
      { message: "Too many assistant requests. Please wait a minute and try again." },
      { status: 429 }
    );
  }

  let payload: AssistantRequest;

  try {
    payload = (await request.json()) as AssistantRequest;
  } catch {
    return NextResponse.json({ message: "Assistant request must be valid JSON." }, { status: 400 });
  }

  const messages = sanitizeMessages(payload.messages);
  const latestUserMessage = [...messages].reverse().find((message) => message.role === "user");

  if (!latestUserMessage) {
    return NextResponse.json({ message: "Ask a product or scheduling question first." }, { status: 400 });
  }

  const redactedMessages = messages.map((message) => ({
    ...message,
    content: redactPersonalDetails(message.content).redacted
  }));
  const redactedLatest = redactPersonalDetails(latestUserMessage.content);
  const personalDetailsDetected = redactedMessages.some((message, index) => message.content !== messages[index]?.content);
  const context = await buildAssistantKnowledge({
    question: redactedLatest.redacted,
    pagePath: cleanText(payload.pagePath)
  });
  const fallbackReply = buildLocalAssistantReply({
    question: redactedLatest.redacted,
    context,
    personalDetailsDetected
  });
  const openAiReply = await generateOpenAiReply({
    messages: redactedMessages,
    context,
    personalDetailsDetected
  });
  const reply = openAiReply || fallbackReply;

  return NextResponse.json({
    reply,
    links: context.links,
    suggestions: suggestionsFor(redactedLatest.redacted, context),
    redacted: personalDetailsDetected,
    mode: openAiReply ? "ai" : "local"
  });
}

async function generateOpenAiReply({
  messages,
  context,
  personalDetailsDetected
}: {
  messages: AssistantMessage[];
  context: AssistantKnowledgeContext;
  personalDetailsDetected: boolean;
}) {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey || process.env.ASSISTANT_OPENAI_DISABLED === "true") {
    return null;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: process.env.OPENAI_ASSISTANT_MODEL || "gpt-5.4-mini",
        instructions: assistantInstructions(personalDetailsDetected),
        input: assistantPrompt(messages, context),
        max_output_tokens: 420
      }),
      signal: controller.signal
    });

    if (!response.ok) {
      console.error("Assistant model request failed", response.status, await response.text());
      return null;
    }

    const body = (await response.json()) as OpenAIResponseBody;
    return extractOpenAiText(body);
  } catch (error) {
    console.error("Assistant model request failed", error);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function assistantInstructions(personalDetailsDetected: boolean) {
  return [
    `You are the website assistant for ${site.name}, a Ventura County window treatment company.`,
    "Answer only from the supplied website context and scheduling context.",
    "Do not request, collect, repeat, or store names, phone numbers, email addresses, or street addresses in chat.",
    "If the visitor shares contact details, tell them those details should go through the booking form or a direct call/text.",
    "For scheduling, explain the process and direct the visitor to the booking page. Do not book inside chat.",
    "Do not invent prices, discounts, warranties, manufacturer claims, or exact lead times.",
    "Keep answers practical, friendly, and under 140 words.",
    personalDetailsDetected ? "The latest conversation contained redacted personal details; start with a brief privacy reminder." : ""
  ]
    .filter(Boolean)
    .join("\n");
}

function assistantPrompt(messages: AssistantMessage[], context: AssistantKnowledgeContext) {
  return [
    "Business facts:",
    ...context.businessFacts.map((fact) => `- ${fact}`),
    context.scheduling ? `\nScheduling context:\n${context.scheduling.text}` : "",
    "\nRelevant website content:",
    ...context.pageSnippets.map((snippet) => `- ${snippet}`),
    "\nConversation:",
    ...messages.map((message) => `${message.role.toUpperCase()}: ${message.content}`),
    "\nWrite the next assistant reply."
  ].join("\n");
}

function extractOpenAiText(body: OpenAIResponseBody) {
  if (typeof body.output_text === "string") {
    return body.output_text.trim();
  }

  if (!Array.isArray(body.output)) return null;

  const text = body.output
    .flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const content = (item as { content?: unknown }).content;
      if (!Array.isArray(content)) return [];
      return content.flatMap((part) => {
        if (!part || typeof part !== "object") return [];
        const candidate = part as { text?: unknown; type?: unknown };
        return typeof candidate.text === "string" ? [candidate.text] : [];
      });
    })
    .join("\n")
    .trim();

  return text || null;
}

function suggestionsFor(question: string, context: AssistantKnowledgeContext) {
  if (context.scheduling || isSchedulingQuestion(question)) {
    return [
      "What happens during the consultation?",
      "Can I compare shutters and shades?",
      "Do you install commercial shades?"
    ];
  }

  const normalized = question.toLowerCase();

  if (normalized.includes("commercial") || normalized.includes("office")) {
    return [
      "What is a commercial shade audit?",
      "Do you offer motorized shades?",
      "How does scheduling work?"
    ];
  }

  if (normalized.includes("shutter") || normalized.includes("shade") || normalized.includes("blind")) {
    return [
      "Compare shutters and shades",
      "What is best for privacy?",
      "How does scheduling work?"
    ];
  }

  return [
    "Compare shutters and shades",
    "How does scheduling work?",
    "Do you serve my city?"
  ];
}
