import type { Config } from "tailwindcss";
import tailwindcssAnimate from "tailwindcss-animate";

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
