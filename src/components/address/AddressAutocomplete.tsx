"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type ComponentPropsWithoutRef,
  type ElementType,
  type FocusEvent,
  type KeyboardEvent
} from "react";
import { createPortal } from "react-dom";
import type { PlaceSuggestion, ResolvedAddress } from "@/lib/places/types";

type AddressAutocompleteProps = Omit<ComponentPropsWithoutRef<"input">, "onChange"> & {
  /**
   * Element used to render the actual input. Defaults to a native <input>.
   * Pass a styled input (e.g. the shadcn <Input>) to match a design system.
   */
  inputAs?: ElementType;
  /**
   * Name of a sibling field (in the same <form>) that should receive the city.
   * When set, the address field is filled with just the street line and the
   * city field with the locality. When omitted, the address field gets the
   * full single-line address.
   */
  cityFieldName?: string;
  /** Called after the user picks a suggestion, with the structured address. */
  onResolved?: (address: ResolvedAddress) => void;
  /** Standard input onChange — forwarded so controlled inputs keep working. */
  onChange?: (event: ChangeEvent<HTMLInputElement>) => void;
};

const MIN_QUERY_LENGTH = 3;
const DEBOUNCE_MS = 220;

function newSessionToken(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
}

/** Set an input's value so that React's onChange fires and uncontrolled display updates. */
function setNativeValue(el: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  setter?.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

export function AddressAutocomplete({
  inputAs,
  cityFieldName,
  onResolved,
  onChange,
  onKeyDown,
  onBlur,
  autoComplete = "off",
  ...inputProps
}: AddressAutocompleteProps) {
  const InputComponent: ElementType = inputAs ?? "input";

  const inputRef = useRef<HTMLInputElement | null>(null);
  const sessionTokenRef = useRef<string>(newSessionToken());
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestSeq = useRef(0);
  const suppressFetchRef = useRef(false);
  const featureDisabledRef = useRef(false);
  const blurTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [mounted, setMounted] = useState(false);
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [rect, setRect] = useState<{ top: number; left: number; width: number } | null>(null);

  useEffect(() => {
    setMounted(true);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (blurTimerRef.current) clearTimeout(blurTimerRef.current);
    };
  }, []);

  const updateRect = useCallback(() => {
    const el = inputRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setRect({ top: r.bottom, left: r.left, width: r.width });
  }, []);

  // Keep the dropdown anchored to the input while scrolling/resizing.
  useEffect(() => {
    if (!open) return;
    updateRect();
    const handler = () => updateRect();
    window.addEventListener("scroll", handler, true);
    window.addEventListener("resize", handler);
    return () => {
      window.removeEventListener("scroll", handler, true);
      window.removeEventListener("resize", handler);
    };
  }, [open, updateRect]);

  const closeDropdown = useCallback(() => {
    setOpen(false);
    setActiveIndex(-1);
  }, []);

  const runQuery = useCallback(async (value: string) => {
    if (featureDisabledRef.current) return;
    const query = value.trim();
    if (query.length < MIN_QUERY_LENGTH) {
      setSuggestions([]);
      closeDropdown();
      return;
    }

    const seq = ++requestSeq.current;
    try {
      const response = await fetch("/api/places/autocomplete/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: query, sessionToken: sessionTokenRef.current })
      });

      // No key configured (or feature off) → permanently behave as a plain input.
      if (response.status === 503) {
        featureDisabledRef.current = true;
        setSuggestions([]);
        closeDropdown();
        return;
      }
      if (!response.ok) return;

      const data = (await response.json()) as { suggestions?: PlaceSuggestion[] };
      if (seq !== requestSeq.current) return; // a newer keystroke won

      const next = data.suggestions ?? [];
      setSuggestions(next);
      setActiveIndex(-1);
      if (next.length > 0) {
        updateRect();
        setOpen(true);
      } else {
        closeDropdown();
      }
    } catch {
      // network hiccup — silently leave the field as a plain input for now
    }
  }, [closeDropdown, updateRect]);

  const queueQuery = useCallback((value: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => void runQuery(value), DEBOUNCE_MS);
  }, [runQuery]);

  const handleChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    onChange?.(event);
    if (suppressFetchRef.current) {
      suppressFetchRef.current = false;
      return;
    }
    queueQuery(event.target.value);
  }, [onChange, queueQuery]);

  const handleSelect = useCallback(async (suggestion: PlaceSuggestion) => {
    const input = inputRef.current;
    if (!input) return;

    let address: ResolvedAddress | null = null;
    try {
      const response = await fetch("/api/places/details/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ placeId: suggestion.placeId, sessionToken: sessionTokenRef.current })
      });
      if (response.ok) {
        const data = (await response.json()) as { address?: ResolvedAddress };
        address = data.address ?? null;
      }
    } catch {
      // fall through to a best-effort value below
    }

    // A details lookup ends the autocomplete session; start a fresh one.
    sessionTokenRef.current = newSessionToken();

    const fallbackFull = [suggestion.primary, suggestion.secondary].filter(Boolean).join(", ");
    const resolved: ResolvedAddress = address ?? {
      fullAddress: fallbackFull,
      street: suggestion.primary,
      city: "",
      state: "",
      zip: ""
    };

    const fillCity = Boolean(cityFieldName) && Boolean(resolved.street);
    const displayValue = fillCity ? resolved.street : resolved.fullAddress || fallbackFull;

    suppressFetchRef.current = true;
    setNativeValue(input, displayValue);

    if (cityFieldName && resolved.city) {
      const cityEl = input.form?.elements.namedItem(cityFieldName);
      if (cityEl instanceof HTMLInputElement) {
        setNativeValue(cityEl, resolved.city);
      }
    }

    onResolved?.(resolved);
    setSuggestions([]);
    closeDropdown();
    input.focus();
  }, [cityFieldName, closeDropdown, onResolved]);

  const handleKeyDown = useCallback((event: KeyboardEvent<HTMLInputElement>) => {
    if (open && suggestions.length > 0) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setActiveIndex((i) => (i + 1) % suggestions.length);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setActiveIndex((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
        return;
      }
      if (event.key === "Enter") {
        if (activeIndex >= 0) {
          event.preventDefault();
          void handleSelect(suggestions[activeIndex]);
          return;
        }
      }
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        closeDropdown();
        return;
      }
    }
    // Not handled by the dropdown — preserve the consumer's own key handling.
    onKeyDown?.(event);
  }, [open, suggestions, activeIndex, handleSelect, closeDropdown, onKeyDown]);

  const handleBlur = useCallback((event: FocusEvent<HTMLInputElement>) => {
    onBlur?.(event);
    // Delay so a suggestion click (which preventDefaults mousedown) isn't cut off.
    if (blurTimerRef.current) clearTimeout(blurTimerRef.current);
    blurTimerRef.current = setTimeout(() => closeDropdown(), 120);
  }, [onBlur, closeDropdown]);

  const showDropdown = mounted && open && suggestions.length > 0 && rect;

  return (
    <>
      <InputComponent
        {...inputProps}
        ref={inputRef}
        autoComplete={autoComplete}
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
      />
      {showDropdown
        ? createPortal(
            <ul
              role="listbox"
              onMouseDown={(e) => e.preventDefault()}
              style={{
                position: "fixed",
                top: rect.top + 4,
                left: rect.left,
                width: rect.width,
                maxHeight: 272,
                overflowY: "auto",
                margin: 0,
                padding: 4,
                listStyle: "none",
                background: "#ffffff",
                border: "1px solid #d4d4d8",
                borderRadius: 10,
                boxShadow: "0 12px 32px rgba(15, 23, 42, 0.16)",
                zIndex: 2147483000,
                fontFamily: "inherit",
                fontSize: 14,
                color: "#111827"
              }}
            >
              {suggestions.map((suggestion, index) => (
                <li
                  key={suggestion.placeId}
                  role="option"
                  aria-selected={index === activeIndex}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => void handleSelect(suggestion)}
                  style={{
                    padding: "8px 10px",
                    borderRadius: 6,
                    cursor: "pointer",
                    background: index === activeIndex ? "#f1f5f9" : "transparent"
                  }}
                >
                  <div style={{ fontWeight: 600, lineHeight: 1.3 }}>{suggestion.primary}</div>
                  {suggestion.secondary ? (
                    <div style={{ fontSize: 12, color: "#6b7280", lineHeight: 1.3 }}>
                      {suggestion.secondary}
                    </div>
                  ) : null}
                </li>
              ))}
              <li
                aria-hidden="true"
                style={{
                  padding: "4px 10px 2px",
                  fontSize: 10,
                  color: "#9ca3af",
                  textAlign: "right"
                }}
              >
                Powered by Google
              </li>
            </ul>,
            document.body
          )
        : null}
    </>
  );
}

export default AddressAutocomplete;
