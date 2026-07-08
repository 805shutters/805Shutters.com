import fs from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const args = process.argv.slice(2);
const packetArg = args.find((arg) => !arg.startsWith("--"));
const live = args.includes("--live");

if (!packetArg) {
  console.error("Usage: node scripts/publish_social_from_packet.mjs <packet.md> [--live]");
  process.exit(1);
}

const graphVersion = process.env.META_GRAPH_VERSION || "v23.0";

const parseEnvFile = async (filePath) => {
  try {
    const text = await fs.readFile(filePath, "utf8");
    const env = {};
    for (const line of text.split(/\r?\n/)) {
      const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
      if (!match) continue;
      const [, key, raw] = match;
      env[key] = raw.replace(/^"(.*)"$/, "$1").trim();
    }
    return env;
  } catch {
    return {};
  }
};

const env = {
  ...process.env,
  ...(await parseEnvFile(path.join(root, ".env.local")))
};

const packetPath = path.resolve(root, packetArg);
const packet = await fs.readFile(packetPath, "utf8");

const section = (heading) => {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = packet.match(new RegExp(`## ${escaped}\\n([\\s\\S]*?)(?=\\n## |$)`));
  return match?.[1]?.trim() || "";
};

const firstMatch = (pattern) => packet.match(pattern)?.[1]?.trim() || "";

const websiteAsset =
  firstMatch(/Photo source after deploy:\s+`([^`]+)`/) ||
  firstMatch(/-\s+(public\/images\/portfolio-enhanced\/[^\s]+-natural\.jpg)/) ||
  firstMatch(/-\s+(public\/images\/portfolio-enhanced\/[^\s]+-card\.jpg)/);

if (!websiteAsset) {
  throw new Error(`No website image asset found in ${packetPath}`);
}

const publicBaseUrl = (env.SOCIAL_PUBLIC_BASE_URL || env.NEXT_PUBLIC_SITE_URL || "https://www.805shutters.com").replace(/\/$/, "");
const toPublicUrl = (assetPath) => {
  if (/^https?:\/\//.test(assetPath)) return assetPath;
  return `${publicBaseUrl}/${assetPath.replace(/^public\//, "").replace(/^\//, "")}`;
};

const imageUrl = toPublicUrl(websiteAsset);
const bookingUrl = env.SOCIAL_BOOKING_URL || "https://www.805shutters.com/book-consultation/";
const facebookCaption = section("Facebook Post Draft");
const instagramCaption = section("Instagram Caption Draft") || facebookCaption;
const googleSummary = section("Google Business Profile Post Draft").replace(/^CTA:.*$/m, "").trim();

const requireEnv = (keys) => {
  const missing = keys.filter((key) => !env[key]);
  if (missing.length) throw new Error(`Missing required env vars: ${missing.join(", ")}`);
};

const graphPost = async (pathPart, body) => {
  const response = await fetch(`https://graph.facebook.com/${graphVersion}/${pathPart}`, {
    method: "POST",
    body: new URLSearchParams(body)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`Meta API failed ${response.status}: ${JSON.stringify(data).slice(0, 1200)}`);
  }
  return data;
};

const graphGet = async (pathPart, query) => {
  const url = new URL(`https://graph.facebook.com/${graphVersion}/${pathPart}`);
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
  const response = await fetch(url);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`Meta API failed ${response.status}: ${JSON.stringify(data).slice(0, 1200)}`);
  }
  return data;
};

const getGoogleAccessToken = async () => {
  requireEnv([
    "GOOGLE_BUSINESS_CLIENT_ID",
    "GOOGLE_BUSINESS_CLIENT_SECRET",
    "GOOGLE_BUSINESS_REFRESH_TOKEN"
  ]);

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.GOOGLE_BUSINESS_CLIENT_ID,
      client_secret: env.GOOGLE_BUSINESS_CLIENT_SECRET,
      refresh_token: env.GOOGLE_BUSINESS_REFRESH_TOKEN,
      grant_type: "refresh_token"
    })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.access_token) {
    throw new Error(`Google OAuth failed ${response.status}: ${JSON.stringify(data).slice(0, 1200)}`);
  }
  return data.access_token;
};

const publishFacebook = async () => {
  requireEnv(["FACEBOOK_PAGE_ID", "FACEBOOK_PAGE_ACCESS_TOKEN"]);
  return graphPost(`${env.FACEBOOK_PAGE_ID}/photos`, {
    url: imageUrl,
    caption: facebookCaption,
    published: "true",
    access_token: env.FACEBOOK_PAGE_ACCESS_TOKEN
  });
};

const publishInstagram = async () => {
  requireEnv(["INSTAGRAM_BUSINESS_ACCOUNT_ID", "INSTAGRAM_ACCESS_TOKEN"]);
  const container = await graphPost(`${env.INSTAGRAM_BUSINESS_ACCOUNT_ID}/media`, {
    image_url: imageUrl,
    caption: instagramCaption,
    access_token: env.INSTAGRAM_ACCESS_TOKEN
  });

  for (let attempt = 0; attempt < 10; attempt += 1) {
    const status = await graphGet(container.id, {
      fields: "status_code,status",
      access_token: env.INSTAGRAM_ACCESS_TOKEN
    });
    if (status.status_code === "FINISHED") break;
    if (status.status_code === "ERROR") {
      throw new Error(`Instagram media container failed: ${JSON.stringify(status)}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }

  const published = await graphPost(`${env.INSTAGRAM_BUSINESS_ACCOUNT_ID}/media_publish`, {
    creation_id: container.id,
    access_token: env.INSTAGRAM_ACCESS_TOKEN
  });
  const details = await graphGet(published.id, {
    fields: "id,permalink",
    access_token: env.INSTAGRAM_ACCESS_TOKEN
  }).catch(() => published);

  return { container, published, details };
};

const publishGoogleBusinessProfile = async () => {
  requireEnv(["GOOGLE_BUSINESS_ACCOUNT_ID", "GOOGLE_BUSINESS_LOCATION_ID"]);
  const token = await getGoogleAccessToken();
  const response = await fetch(
    `https://mybusiness.googleapis.com/v4/accounts/${env.GOOGLE_BUSINESS_ACCOUNT_ID}/locations/${env.GOOGLE_BUSINESS_LOCATION_ID}/localPosts`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        languageCode: "en-US",
        summary: googleSummary,
        topicType: "STANDARD",
        callToAction: {
          actionType: "BOOK",
          url: bookingUrl
        },
        media: [
          {
            mediaFormat: "PHOTO",
            sourceUrl: imageUrl
          }
        ]
      })
    }
  );
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`Google Business Profile API failed ${response.status}: ${JSON.stringify(data).slice(0, 1200)}`);
  }
  return data;
};

const plan = {
  packet: path.relative(root, packetPath),
  live,
  imageUrl,
  facebook: {
    ready: Boolean(env.FACEBOOK_PAGE_ID && env.FACEBOOK_PAGE_ACCESS_TOKEN),
    pageId: env.FACEBOOK_PAGE_ID || null
  },
  instagram: {
    ready: Boolean(env.INSTAGRAM_BUSINESS_ACCOUNT_ID && env.INSTAGRAM_ACCESS_TOKEN),
    accountId: env.INSTAGRAM_BUSINESS_ACCOUNT_ID || null
  },
  googleBusinessProfile: {
    ready: Boolean(
      env.GOOGLE_BUSINESS_ACCOUNT_ID &&
        env.GOOGLE_BUSINESS_LOCATION_ID &&
        env.GOOGLE_BUSINESS_CLIENT_ID &&
        env.GOOGLE_BUSINESS_CLIENT_SECRET &&
        env.GOOGLE_BUSINESS_REFRESH_TOKEN
    ),
    accountId: env.GOOGLE_BUSINESS_ACCOUNT_ID || null,
    locationId: env.GOOGLE_BUSINESS_LOCATION_ID || null
  }
};

if (!live) {
  console.log(JSON.stringify({ mode: "dry-run", plan }, null, 2));
  process.exit(0);
}

const results = {};
results.facebook = await publishFacebook();
results.instagram = await publishInstagram();
results.googleBusinessProfile = await publishGoogleBusinessProfile();

console.log(JSON.stringify({ mode: "live", plan, results }, null, 2));
