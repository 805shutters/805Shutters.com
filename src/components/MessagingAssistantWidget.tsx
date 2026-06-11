"use client";

import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from "react";

type WidgetMessage = {
  id: string;
  role: "assistant" | "user";
  content: string;
};

type AssistantLink = {
  label: string;
  href: string;
};

type AssistantResponse = {
  reply?: string;
  links?: AssistantLink[];
  suggestions?: string[];
  redacted?: boolean;
  message?: string;
};

const starterSuggestions = [
  "Compare shutters and shades",
  "How does scheduling work?",
  "Do you serve Thousand Oaks?",
  "Commercial roller shades"
];

function createId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function MessagingAssistantWidget() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [links, setLinks] = useState<AssistantLink[]>([]);
  const [suggestions, setSuggestions] = useState(starterSuggestions);
  const [error, setError] = useState("");
  const [messages, setMessages] = useState<WidgetMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      content:
        "Hi, I can help compare products, explain service areas, and answer scheduling questions."
    }
  ]);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const messageListRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (open) {
      window.setTimeout(() => textareaRef.current?.focus(), 80);
    }
  }, [open]);

  useEffect(() => {
    messageListRef.current?.scrollTo({
      top: messageListRef.current.scrollHeight,
      behavior: "smooth"
    });
  }, [messages, pending]);

  async function submitQuestion(question: string) {
    const trimmed = question.trim();
    if (!trimmed || pending) return;

    setOpen(true);
    setInput("");
    setError("");
    setPending(true);

    const userMessage: WidgetMessage = {
      id: createId(),
      role: "user",
      content: trimmed
    };
    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);

    try {
      const response = await fetch("/api/assistant/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          pagePath: window.location.pathname,
          messages: nextMessages.map(({ role, content }) => ({ role, content }))
        })
      });
      const body = (await response.json()) as AssistantResponse;

      if (!response.ok) {
        throw new Error(body.message || "The assistant could not answer right now.");
      }

      setMessages((current) => [
        ...current,
        {
          id: createId(),
          role: "assistant",
          content: body.reply || "I could not find a reliable answer for that yet."
        }
      ]);
      setLinks(body.links || []);
      setSuggestions(body.suggestions?.length ? body.suggestions : starterSuggestions);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "The assistant could not answer right now.");
    } finally {
      setPending(false);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void submitQuestion(input);
  }

  function handleInputKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void submitQuestion(input);
    }
  }

  return (
    <aside className={`assistant-widget ${open ? "assistant-widget--open" : ""}`} aria-label="805 Shutters assistant">
      {open ? (
        <section className="assistant-panel" role="dialog" aria-modal="false" aria-labelledby="assistant-title">
          <div className="assistant-panel__head">
            <div>
              <p>Website Assistant</p>
              <h2 id="assistant-title">Ask 805 Shutters</h2>
            </div>
            <button type="button" className="assistant-icon-button" onClick={() => setOpen(false)} aria-label="Close assistant">
              <CloseIcon />
            </button>
          </div>

          <div className="assistant-privacy-note">No contact details here. Use booking or phone when ready.</div>

          <div className="assistant-messages" ref={messageListRef} aria-live="polite">
            {messages.map((message) => (
              <div className={`assistant-message assistant-message--${message.role}`} key={message.id}>
                {message.content}
              </div>
            ))}
            {pending ? (
              <div className="assistant-message assistant-message--assistant assistant-message--pending">
                Checking the site and scheduling details...
              </div>
            ) : null}
          </div>

          {links.length > 0 ? (
            <div className="assistant-links" aria-label="Helpful links">
              {links.slice(0, 3).map((link) => (
                <a href={link.href} key={link.href}>
                  {link.label}
                </a>
              ))}
            </div>
          ) : null}

          <div className="assistant-suggestions" aria-label="Suggested questions">
            {suggestions.slice(0, 3).map((suggestion) => (
              <button type="button" key={suggestion} onClick={() => void submitQuestion(suggestion)} disabled={pending}>
                {suggestion}
              </button>
            ))}
          </div>

          <form className="assistant-form" onSubmit={handleSubmit}>
            <label htmlFor="assistant-input">Ask a question</label>
            <div className="assistant-input-row">
              <textarea
                id="assistant-input"
                ref={textareaRef}
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={handleInputKeyDown}
                rows={2}
                placeholder="Ask about products, service areas, or scheduling"
                disabled={pending}
              />
              <button type="submit" className="assistant-send" disabled={pending || !input.trim()} aria-label="Send question">
                <SendIcon />
              </button>
            </div>
            {error ? <p className="assistant-error">{error}</p> : null}
          </form>
        </section>
      ) : null}

      <button
        type="button"
        className="assistant-launcher"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-label="Open 805 Shutters assistant"
      >
        <MessageIcon />
        <span>Ask 805</span>
      </button>
    </aside>
  );
}

function MessageIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M4 6.8A3.8 3.8 0 0 1 7.8 3h8.4A3.8 3.8 0 0 1 20 6.8v5.9a3.8 3.8 0 0 1-3.8 3.8h-4.7L6.4 21v-4.5A3.8 3.8 0 0 1 4 12.7V6.8z" />
      <path d="M8 8.5h8" />
      <path d="M8 12h5.5" />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M4 11.5 20 4l-5.6 16-3.1-6.3L4 11.5z" />
      <path d="m11.3 13.7 3.5-3.5" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="m6 6 12 12" />
      <path d="m18 6-12 12" />
    </svg>
  );
}
