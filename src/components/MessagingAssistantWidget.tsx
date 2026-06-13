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

type AssistantView = "closed" | "choices" | "chat";

const textQuestionHref = `sms:+18052985555?&body=${encodeURIComponent(
  "Hi 805 Shutters, I have a question: "
)}`;

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
  const [view, setView] = useState<AssistantView>("closed");
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
  const open = view !== "closed";

  useEffect(() => {
    if (view === "chat") {
      window.setTimeout(() => textareaRef.current?.focus(), 80);
    }
  }, [view]);

  useEffect(() => {
    if (view === "chat") {
      messageListRef.current?.scrollTo({
        top: messageListRef.current.scrollHeight,
        behavior: "smooth"
      });
    }
  }, [messages, pending, view]);

  async function submitQuestion(question: string) {
    const trimmed = question.trim();
    if (!trimmed || pending) return;

    setView("chat");
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
      {view === "choices" ? (
        <section
          className="assistant-panel assistant-panel--choices"
          role="dialog"
          aria-modal="false"
          aria-labelledby="assistant-options-title"
        >
          <div className="assistant-panel__head">
            <div>
              <p>Ask 805</p>
              <h2 id="assistant-options-title">Choose how to ask</h2>
            </div>
            <button type="button" className="assistant-icon-button" onClick={() => setView("closed")} aria-label="Close Ask 805 options">
              <CloseIcon />
            </button>
          </div>

          <div className="assistant-choice-panel__body">
            <div className="assistant-choice-list" aria-label="Ask 805 options">
              <a className="assistant-choice assistant-choice--text" href={textQuestionHref}>
                <span className="assistant-choice__icon" aria-hidden="true">
                  <PhoneIcon />
                </span>
                <span className="assistant-choice__copy">
                  <strong>Text us a question</strong>
                  <small>805-298-5555. Real reply from 805 Shutters.</small>
                </span>
                <ArrowIcon />
              </a>

              <button type="button" className="assistant-choice" onClick={() => setView("chat")}>
                <span className="assistant-choice__icon" aria-hidden="true">
                  <SparkIcon />
                </span>
                <span className="assistant-choice__copy">
                  <strong>General inquiry</strong>
                  <small>Use the AI assistant for product and scheduling answers.</small>
                </span>
                <ArrowIcon />
              </button>
            </div>
          </div>
        </section>
      ) : null}

      {view === "chat" ? (
        <section className="assistant-panel" role="dialog" aria-modal="false" aria-labelledby="assistant-title">
          <div className="assistant-panel__head">
            <div>
              <p>Website Assistant</p>
              <h2 id="assistant-title">Ask 805 Shutters</h2>
            </div>
            <button type="button" className="assistant-icon-button" onClick={() => setView("closed")} aria-label="Close assistant">
              <CloseIcon />
            </button>
          </div>

          <div className="assistant-privacy-note">For personal details, text us or use booking. AI answers general questions only.</div>

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
        onClick={() => setView("choices")}
        aria-expanded={open}
        aria-label="Open Ask 805 options"
      >
        <span className="assistant-launcher__icon" aria-hidden="true">
          <MessageIcon />
        </span>
        <span className="assistant-launcher__copy">
          <span className="assistant-launcher__eyebrow">Text or AI</span>
          <span className="assistant-launcher__title">Ask 805</span>
        </span>
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

function PhoneIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M7.2 4.5 9.4 4l2 4.3-1.4 1.1a12 12 0 0 0 4.6 4.6l1.1-1.4 4.3 2-.5 2.2c-.2 1-1.1 1.7-2.1 1.7A13.9 13.9 0 0 1 5.5 6.6c0-1 .7-1.9 1.7-2.1z" />
    </svg>
  );
}

function SparkIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="m12 3 1.5 5.1L18 10l-4.5 1.9L12 17l-1.5-5.1L6 10l4.5-1.9L12 3z" />
      <path d="m5 16 .7 2.3L8 19l-2.3.7L5 22l-.7-2.3L2 19l2.3-.7L5 16z" />
      <path d="m19 2 .7 2.3L22 5l-2.3.7L19 8l-.7-2.3L16 5l2.3-.7L19 2z" />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg className="assistant-choice__arrow" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="m9 6 6 6-6 6" />
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
