import type { Metadata } from "next";
import { BadgeCheck, Globe2, Mail, MessageSquareText, Phone, ShieldCheck } from "lucide-react";
import { brandIdentity } from "@/lib/brand-identity";
import { ogDefaults, site } from "@/lib/site-data";

const title = "805 Shutters Official Contact Information";
const description =
  "Verify the official website, phone number, email address, contracts, appointments, and payment communications for 805 Shutters.";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: brandIdentity.officialPath },
  openGraph: {
    ...ogDefaults,
    title,
    description,
    url: `${site.baseUrl}${brandIdentity.officialPath}`,
    images: [
      {
        url: "/brand/805-shutters-logo-exact-transparent.png",
        alt: "805 Shutters official logo"
      }
    ]
  }
};

export default function OfficialContactPage() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: title,
    url: `${site.baseUrl}${brandIdentity.officialPath}`,
    description,
    mainEntity: {
      "@type": "Organization",
      "@id": `${site.baseUrl}#local-business`,
      name: brandIdentity.name,
      url: brandIdentity.website,
      telephone: brandIdentity.phone,
      email: brandIdentity.email,
      logo: `${site.baseUrl}/brand/805-shutters-logo-exact-transparent.png`
    }
  };

  return (
    <div className="official-page">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <section className="official-hero" aria-labelledby="official-contact-title">
        <div className="official-hero__inner">
          <div className="official-hero__brand">
            <img
              src="/brand/805-shutters-logo-exact-transparent.png"
              alt="805 Shutters"
              width={286}
              height={270}
            />
            <p>{brandIdentity.serviceDescription}</p>
          </div>
          <div className="official-hero__copy">
            <p className="eyebrow">
              <BadgeCheck aria-hidden="true" /> Official business identity
            </p>
            <h1 id="official-contact-title">Official 805 Shutters Contact Information</h1>
            <p>
              Use this page to confirm you are communicating with 805 Shutters before an
              appointment, contract, warranty request, or payment.
            </p>
            <div className="official-actions" aria-label="Contact 805 Shutters">
              <a href={brandIdentity.phoneHref} title="Call 805 Shutters">
                <Phone aria-hidden="true" /> Call
              </a>
              <a href={brandIdentity.smsHref} title="Text 805 Shutters">
                <MessageSquareText aria-hidden="true" /> Text
              </a>
              <a href={brandIdentity.emailHref} title="Email 805 Shutters">
                <Mail aria-hidden="true" /> Email
              </a>
            </div>
          </div>
        </div>
      </section>

      <section className="official-contact-band" aria-label="Verified contact details">
        <div className="official-contact-band__inner">
          <div>
            <Globe2 aria-hidden="true" />
            <span>Official website</span>
            <a href={brandIdentity.website}>{brandIdentity.domain}</a>
          </div>
          <div>
            <Phone aria-hidden="true" />
            <span>Primary call and text</span>
            <a href={brandIdentity.phoneHref}>{brandIdentity.phoneDisplay}</a>
          </div>
          <div>
            <Mail aria-hidden="true" />
            <span>Official email</span>
            <a href={brandIdentity.emailHref}>{brandIdentity.email}</a>
          </div>
        </div>
      </section>

      <section className="official-verification-band">
        <div className="official-verification-band__inner">
          <div>
            <p className="eyebrow">Before you proceed</p>
            <h2>Verify the name and contact details.</h2>
          </div>
          <ul>
            <li>
              <ShieldCheck aria-hidden="true" />
              <span>Appointments and contracts identify the company as 805 Shutters.</span>
            </li>
            <li>
              <ShieldCheck aria-hidden="true" />
              <span>Customer messages include {brandIdentity.domain} or {brandIdentity.phone}.</span>
            </li>
            <li>
              <ShieldCheck aria-hidden="true" />
              <span>Call the primary number above before paying whenever a request is uncertain.</span>
            </li>
          </ul>
        </div>
      </section>

      <section className="official-disclosure-band">
        <div>
          <strong>{brandIdentity.name}</strong>
          <p>{brandIdentity.nonAffiliationStatement}</p>
        </div>
      </section>
    </div>
  );
}
