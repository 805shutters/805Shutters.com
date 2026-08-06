import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Pick black or white text for a given background hex color based on
 * perceived luminance (WCAG relative luminance). Returns "#000000" for
 * light backgrounds and "#FFFFFF" for dark ones.
 */
export function getReadableTextColor(bgHex: string): "#000000" | "#FFFFFF" {
  const hex = bgHex.replace("#", "").trim();
  const expanded =
    hex.length === 3
      ? hex
          .split("")
          .map((c) => c + c)
          .join("")
      : hex.length === 6
        ? hex
        : null;
  if (!expanded) return "#000000";
  const r = parseInt(expanded.slice(0, 2), 16) / 255;
  const g = parseInt(expanded.slice(2, 4), 16) / 255;
  const b = parseInt(expanded.slice(4, 6), 16) / 255;
  const toLin = (c: number) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  const luminance = 0.2126 * toLin(r) + 0.7152 * toLin(g) + 0.0722 * toLin(b);
  return luminance > 0.5 ? "#000000" : "#FFFFFF";
}

/**
 * Parse a date string in local timezone (avoids UTC midnight issue).
 *
 * Problem: new Date("2026-01-31") interprets as UTC midnight,
 * which shows as Jan 30 at 4pm in PST.
 *
 * Solution: Append noon time to force local timezone interpretation.
 *
 * @param dateStr - Date string like "2026-01-31" or ISO timestamp
 * @returns Date object in local timezone, or null if invalid
 */
export function parseLocalDate(dateStr: string | null | undefined): Date | null {
  if (!dateStr) return null;
  // Extract just the date part if it's an ISO timestamp
  const datePart = dateStr.includes("T") ? dateStr.split("T")[0] : dateStr;
  // Append noon time to avoid timezone day-shift issues
  return new Date(datePart + "T12:00:00");
}
