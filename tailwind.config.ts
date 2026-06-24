import type { Config } from "tailwindcss";
import tailwindcssAnimate from "tailwindcss-animate";

// ── 805 metal palettes ──────────────────────────────────────────────────────
// The quote builder was ported from MTS (cobalt blue + teal). To match the 805
// Shutters brand (classic black / white / platinum, accented only with shades
// of silver), every chromatic Tailwind family is remapped onto a warm-neutral
// "metal" ramp below. Because this config is scoped to ./src/mts-quote only
// (with `important: ".mts-quote-scope"`), these overrides never touch the
// plain-CSS marketing site. Ramps stay monotonic light→dark so hover/active
// shade steps (e.g. hover:bg-x-700 over bg-x-600) still darken correctly.

// Pewter — the master warm-platinum ramp. Drives every neutral + decorative
// family (slate/gray/blue/sky/cyan/teal/indigo/violet/purple/fuchsia/pink…).
const pewter = {
  50: "#faf9f7",
  100: "#f3f3f0",
  200: "#e7e6e2",
  300: "#d6d5cf",
  400: "#b6b4ac",
  500: "#898680",
  600: "#67645e",
  700: "#4c4b46",
  800: "#343330",
  900: "#1d1d1b",
  950: "#0b0b0b",
};

// Brushed steel — a faintly cool silver for "positive" status (sold / success).
const steel = {
  50: "#f5f7f5",
  100: "#eaefea",
  200: "#d8e0db",
  300: "#c2cdc5",
  400: "#9aa89e",
  500: "#75847a",
  600: "#5a665e",
  700: "#454e49",
  800: "#313732",
  900: "#1c201d",
  950: "#0c0f0d",
};

// Champagne — a warm aged-brass silver for "in-progress" status (ordered / warning).
const champagne = {
  50: "#f8f7f3",
  100: "#efece3",
  200: "#e2dccc",
  300: "#cfc6b0",
  400: "#b3a988",
  500: "#8c836a",
  600: "#6b6453",
  700: "#4f4a3e",
  800: "#36332b",
  900: "#1e1c18",
  950: "#0d0c0a",
};

// Oxidized iron — a deeply muted warm metal for destructive / danger states.
const iron = {
  50: "#f8f5f4",
  100: "#efe7e5",
  200: "#e0d2cf",
  300: "#ccb6b1",
  400: "#b08e87",
  500: "#8a655e",
  600: "#6d4a44",
  700: "#503631",
  800: "#362422",
  900: "#1f1514",
  950: "#0e0a09",
};

// Scoped Tailwind for the ported MTS quote builder ONLY.
// - `content` is limited to the ported module so utilities are generated only for it.
// - `important: ".mts-quote-scope"` confines every utility to descendants of the
//   scope wrapper, so the plain-CSS marketing site is never touched.
// - preflight is OFF (no global reset); a scoped reset lives in mts-quote.css.
export default {
  darkMode: ["class"],
  content: ["./src/mts-quote/**/*.{ts,tsx}"],
  important: ".mts-quote-scope",
  corePlugins: {
    preflight: false,
  },
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      fontFamily: {
        sans: [
          "Inter",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "Roboto",
          "Helvetica Neue",
          "Arial",
          "Noto Sans",
          "sans-serif",
        ],
        heading: ["Montserrat", "system-ui", "sans-serif"],
        display: ["Outfit", "system-ui", "sans-serif"],
        logo: ["Oswald", "Impact", "sans-serif"],
        serif: ["Lora", "ui-serif", "Georgia", "Cambria", "Times New Roman", "Times", "serif"],
        mono: [
          "Space Mono",
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "Monaco",
          "Consolas",
          "Liberation Mono",
          "Courier New",
          "monospace",
        ],
      },
      colors: {
        // 805 metal remaps — desaturate every MTS-era chromatic family into the
        // black/white/platinum/silver brand. Neutral + decorative families share
        // the pewter ramp; status families keep a faint metallic hue so the
        // dashboard pipeline (sold / ordered / danger) stays legible.
        slate: pewter,
        gray: pewter,
        zinc: pewter,
        neutral: pewter,
        stone: pewter,
        blue: pewter,
        sky: pewter,
        cyan: pewter,
        teal: pewter,
        indigo: pewter,
        violet: pewter,
        purple: pewter,
        fuchsia: pewter,
        pink: pewter,
        emerald: steel,
        green: steel,
        amber: champagne,
        yellow: champagne,
        orange: champagne,
        red: iron,
        rose: iron,
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
        success: {
          DEFAULT: "hsl(var(--success))",
          foreground: "hsl(var(--success-foreground))",
        },
        status: {
          red: "hsl(var(--status-red))",
          orange: "hsl(var(--status-orange))",
          amber: "hsl(var(--status-amber))",
          rose: "hsl(var(--status-rose))",
          blue: "hsl(var(--status-blue))",
          yellow: "hsl(var(--status-yellow))",
          purple: "hsl(var(--status-purple))",
          cyan: "hsl(var(--status-cyan))",
          emerald: "hsl(var(--status-emerald))",
        },
        mts: {
          blue: "hsl(var(--mts-blue))",
          "blue-light": "hsl(var(--mts-blue-light))",
          teal: "hsl(var(--mts-teal))",
          "teal-light": "hsl(var(--mts-teal-light))",
          gray: "hsl(var(--mts-gray))",
          "gray-light": "hsl(var(--mts-gray-light))",
          dark: "hsl(var(--mts-dark))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "fade-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        "slide-in-right": {
          from: { transform: "translateX(100%)" },
          to: { transform: "translateX(0)" },
        },
        "bounce-subtle": {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-5px)" },
        },
        "soft-pulse": {
          "0%, 100%": {
            opacity: "0.65",
            boxShadow: "0 0 6px rgba(239, 68, 68, 0.15)",
          },
          "50%": {
            opacity: "0.85",
            boxShadow: "0 0 10px rgba(239, 68, 68, 0.3)",
          },
        },
        "soft-pink-pulse": {
          "0%, 100%": { backgroundColor: "rgba(236, 72, 153, 0.15)" },
          "50%": { backgroundColor: "rgba(236, 72, 153, 0.3)" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "fade-in": "fade-in 0.3s ease-out",
        "slide-in-right": "slide-in-right 0.3s ease-out",
        "bounce-subtle": "bounce-subtle 2s ease-in-out infinite",
        "soft-pulse": "soft-pulse 10s ease-in-out infinite",
        "soft-pink-pulse": "soft-pink-pulse 6s ease-in-out infinite",
      },
      boxShadow: {
        "2xs": "var(--shadow-2xs)",
        xs: "var(--shadow-xs)",
        sm: "var(--shadow-sm)",
        md: "var(--shadow-md)",
        lg: "var(--shadow-lg)",
        xl: "var(--shadow-xl)",
        "2xl": "var(--shadow-2xl)",
      },
    },
  },
  plugins: [tailwindcssAnimate],
} satisfies Config;
