import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const outputDir = path.join(process.cwd(), "public", "ads");
const logoPath = path.join(process.cwd(), "public", "brand", "805-shutters-logo.png");

const sizes = [
  { suffix: "4x5", width: 1080, height: 1350 },
  { suffix: "1x1", width: 1080, height: 1080 },
  { suffix: "9x16", width: 1080, height: 1920 }
];

const concepts = [
  {
    slug: "free-consultation",
    image: "reports/screenshots/home-desktop-refined.png",
    eyebrow: "VENTURA COUNTY",
    headline: "Free In-Home Consultation",
    body: "Custom shutters, shades, blinds and drapery.",
    cta: "Call 805-806-9344"
  },
  {
    slug: "light-privacy",
    image: "reports/screenshots/home-mobile-refined.png",
    eyebrow: "LIGHT + PRIVACY",
    headline: "Finish The Room",
    body: "Compare custom shades, shutters and blinds.",
    cta: "Book Free Measure"
  },
  {
    slug: "plantation-shutters",
    image: "reports/screenshots/services-refined.png",
    eyebrow: "CUSTOM SHUTTERS",
    headline: "Plantation Shutters",
    body: "Measured and installed by a local team.",
    cta: "Free Consultation"
  },
  {
    slug: "window-shades",
    image: "reports/screenshots/home-desktop-retail.png",
    eyebrow: "CUSTOM SHADES",
    headline: "Control Glare + Heat",
    body: "Roller, honeycomb, woven wood and motorized options.",
    cta: "Schedule Now"
  },
  {
    slug: "custom-blinds",
    image: "reports/screenshots/consultation-desktop-retail.png",
    eyebrow: "CUSTOM BLINDS",
    headline: "Better Everyday Privacy",
    body: "Wood, faux wood, aluminum and vertical blinds.",
    cta: "Start With A Free Quote"
  },
  {
    slug: "commercial-coverings",
    image: "reports/screenshots/consultation-mobile-retail.png",
    eyebrow: "COMMERCIAL",
    headline: "Roller Shades For Workspaces",
    body: "Offices, storefronts, schools and shared spaces.",
    cta: "Request A Quote"
  }
];

function escapeXml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function wrapText(text, maxChars) {
  const words = text.split(/\s+/);
  const lines = [];
  let current = "";

  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxChars && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }

  if (current) {
    lines.push(current);
  }

  return lines;
}

function textOverlay({ width, height, concept }) {
  const compact = height <= 1080;
  const top = compact ? height - 470 : height - 620;
  const headlineSize = compact ? 64 : 76;
  const bodySize = compact ? 31 : 38;
  const headlineLines = wrapText(concept.headline, compact ? 20 : 18).slice(0, 3);
  const bodyLines = wrapText(concept.body, compact ? 40 : 34).slice(0, 3);
  const headlineY = top + 125;
  const headlineLineHeight = compact ? 72 : 84;
  const bodyStartY = headlineY + headlineLines.length * headlineLineHeight + 12;
  const bodyLineHeight = compact ? 40 : 48;
  const ctaY = bodyStartY + bodyLines.length * bodyLineHeight + 44;
  const panelHeight = Math.min(height - top - 60, ctaY - top + 108);
  const headlineMarkup = headlineLines
    .map(
      (line, index) =>
        `<text x="78" y="${headlineY + index * headlineLineHeight}" font-family="Arial, Helvetica, sans-serif" font-size="${headlineSize}" font-weight="900" fill="#151515">${escapeXml(line)}</text>`
    )
    .join("");
  const bodyMarkup = bodyLines
    .map(
      (line, index) =>
        `<text x="78" y="${bodyStartY + index * bodyLineHeight}" font-family="Arial, Helvetica, sans-serif" font-size="${bodySize}" font-weight="600" fill="#39322b">${escapeXml(line)}</text>`
    )
    .join("");

  return Buffer.from(`
    <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="shade" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stop-color="#000000" stop-opacity="0.02"/>
          <stop offset="0.48" stop-color="#000000" stop-opacity="0.1"/>
          <stop offset="1" stop-color="#000000" stop-opacity="0.78"/>
        </linearGradient>
      </defs>
      <rect width="${width}" height="${height}" fill="url(#shade)"/>
      <rect x="54" y="${top - 18}" width="${width - 108}" height="${panelHeight}" fill="#ffffff" opacity="0.94"/>
      <text x="78" y="${top + 34}" font-family="Arial, Helvetica, sans-serif" font-size="25" font-weight="800" letter-spacing="3" fill="#7a5b2a">${escapeXml(concept.eyebrow)}</text>
      ${headlineMarkup}
      ${bodyMarkup}
      <rect x="78" y="${ctaY}" width="360" height="74" fill="#171717"/>
      <text x="106" y="${ctaY + 48}" font-family="Arial, Helvetica, sans-serif" font-size="28" font-weight="800" fill="#ffffff">${escapeXml(concept.cta)}</text>
    </svg>
  `);
}

async function fetchBuffer(url) {
  if (!url.startsWith("http")) {
    return fs.readFile(path.join(process.cwd(), url));
  }
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to fetch ${url}: ${response.status}`);
      }
      return Buffer.from(await response.arrayBuffer());
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, attempt * 750));
    }
  }
  throw lastError;
}

async function buildCreative(concept, size) {
  const image = await fetchBuffer(concept.image);
  const logo = await sharp(logoPath)
    .resize({ width: size.suffix === "9x16" ? 190 : 160 })
    .png()
    .toBuffer();

  const output = path.join(outputDir, `805-${concept.slug}-${size.suffix}.jpg`);
  await sharp(image)
    .resize(size.width, size.height, { fit: "cover", position: "center" })
    .modulate({ brightness: 0.98, saturation: 1.02 })
    .composite([
      { input: textOverlay({ ...size, concept }), left: 0, top: 0 },
      {
        input: logo,
        left: size.width - (size.suffix === "9x16" ? 255 : 220),
        top: 46
      }
    ])
    .jpeg({ quality: 88, mozjpeg: true })
    .toFile(output);
  return output;
}

await fs.mkdir(outputDir, { recursive: true });
const outputs = [];

for (const concept of concepts) {
  for (const size of sizes) {
    outputs.push(await buildCreative(concept, size));
  }
}

console.log(outputs.join("\n"));
