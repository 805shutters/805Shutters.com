export const brandIdentity = {
  name: "805 Shutters",
  serviceDescription: "Custom shutters, shades, blinds and drapery",
  domain: "805Shutters.com",
  website: "https://www.805shutters.com",
  officialPath: "/official/",
  phone: "805-590-8050",
  phoneDisplay: "(805) 590-8050",
  phoneHref: "tel:+18055908050",
  smsHref: "sms:+18055908050",
  email: "805@805shutters.com",
  emailHref: "mailto:805@805shutters.com",
  mailingAddress: {
    privateMailbox: "#401",
    streetAddress: "2390 Las Posas Road, Suite C",
    addressLocality: "Camarillo",
    addressRegion: "CA",
    postalCode: "93010",
    addressCountry: "US"
  },
  mailingAddressDisplay: "805 Shutters\n#401\n2390 Las Posas Road, Suite C\nCamarillo, CA 93010",
  serviceArea: "Ventura County, North Los Angeles County, and Santa Clarita",
  nonAffiliationStatement:
    "805 Shutters is not affiliated with other similarly named window-treatment companies."
} as const;

export const officialContactLine =
  `Official 805 Shutters contact: ${brandIdentity.domain} | ${brandIdentity.phone} | ${brandIdentity.email}`;
