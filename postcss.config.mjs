// PostCSS for the scoped MTS quote-builder Tailwind layer.
// globals.css contains no @tailwind directives, so it passes through unchanged
// (autoprefixer only adds vendor prefixes). Tailwind output is generated solely
// for src/mts-quote/mts-quote.css and confined via `important: ".mts-quote-scope"`.
const config = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};

export default config;
