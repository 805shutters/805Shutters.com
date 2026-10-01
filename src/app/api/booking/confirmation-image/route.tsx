import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { bookingConsultant } from "@/lib/booking/consultant";
import { confirmationStart } from "@/lib/booking/confirmation-message";
import { brandIdentity } from "@/lib/brand-identity";

export const runtime = "nodejs";
let portrait: Promise<string> | undefined;
let logo: Promise<string> | undefined;

/** Design B: date first, then the same approved portrait and bio as the web. */
export async function GET(request: Request) {
  const start = confirmationStart(new URL(request.url).searchParams.get("start"));
  if (!start) return new Response("Invalid appointment date", { status: 400 });
  const date = new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", weekday: "long", month: "long", day: "numeric", year: "numeric" }).format(start);
  const time = new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", hour: "numeric", minute: "2-digit" }).format(start);
  try {
    portrait ??= readFile(path.join(process.cwd(), "public/images/team/jessica-design-consultant.png")).then(data => `data:image/png;base64,${data.toString("base64")}`).catch(error => { portrait = undefined; throw error; });
    logo ??= readFile(path.join(process.cwd(), "public/brand/805-shutters-logo-header.png")).then(data => `data:image/png;base64,${data.toString("base64")}`).catch(error => { logo = undefined; throw error; });
    const [photo, companyLogo] = await Promise.all([portrait, logo]);
    return new ImageResponse(
      <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%", padding: 48, background: "#f8f6f0", color: "#152e40", fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", flexDirection: "column", background: "#526957", color: "#ffffff", padding: "32px 38px", gap: 18 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
            <svg width="46" height="46" viewBox="0 0 40 40"><path d="M8 21 L17 30 L33 11" fill="none" stroke="#ffffff" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" /></svg>
            <div style={{ display: "flex", fontSize: 43, fontWeight: 700 }}>Appointment confirmed</div>
          </div>
          <div style={{ display: "flex", fontSize: 19, letterSpacing: 3 }}>WE LOOK FORWARD TO SEEING YOU</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", padding: "28px 24px", gap: 10 }}>
          <div style={{ display: "flex", fontSize: 35, fontWeight: 700 }}>{date}</div>
          <div style={{ display: "flex", fontSize: 40 }}>{time} · Pacific time</div>
          <div style={{ display: "flex", fontSize: 25 }}>Free in-home consultation</div>
        </div>
        <div style={{ display: "flex", height: 2, background: "#b69a59" }} />
        <div style={{ display: "flex", padding: "28px 24px", gap: 32, flex: 1, alignItems: "center" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={photo} alt="Jessica, your design consultant" width={280} height={280} style={{ borderRadius: 8, objectFit: "cover", objectPosition: "center top" }} />
          <div style={{ display: "flex", flexDirection: "column", flex: 1, gap: 12 }}>
            <div style={{ display: "flex", fontSize: 35, fontWeight: 700 }}>Meet {bookingConsultant.name}</div>
            <div style={{ display: "flex", fontSize: 24, color: "#526957" }}>{bookingConsultant.role}</div>
            <div style={{ display: "flex", fontSize: 25, lineHeight: 1.35 }}>{bookingConsultant.bio}</div>
          </div>
        </div>
        <div style={{ display: "flex", background: "#ffffff", color: "#111111", alignItems: "center", padding: "24px 32px", gap: 42, borderTop: "2px solid #b69a59" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={companyLogo} alt="805 Shutters" width={182} height={119} />
          <div style={{ display: "flex", flexDirection: "column", flex: 1, gap: 10, borderLeft: "1px solid #d6d6d6", paddingLeft: 34 }}>
            <div style={{ display: "flex", fontSize: 28 }}>{brandIdentity.phoneDisplay}</div>
            <div style={{ display: "flex", fontSize: 26 }}>{brandIdentity.domain}</div>
            <div style={{ display: "flex", fontSize: 24 }}>{brandIdentity.email}</div>
          </div>
        </div>
      </div>,
      { width: 1000, height: 1000, headers: { "Cache-Control": "public, max-age=86400, s-maxage=86400", "X-Robots-Tag": "noindex, nofollow" } },
    );
  } catch {
    return new Response("Confirmation image unavailable", { status: 503 });
  }
}
