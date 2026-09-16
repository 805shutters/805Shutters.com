export type CustomerContractTermSection = {
  heading?: string;
  paragraphs?: string[];
  bullets?: string[];
};

export type CustomerContractTerms = {
  version: "2026-09-16";
  sections: CustomerContractTermSection[];
};

export const SHUTTER_MANUFACTURER_WARRANTY_SECTIONS: CustomerContractTermSection[] = [
  {
    heading: "Shutter Manufacturer Warranty",
    paragraphs: [
      "Your shutters include manufacturer warranty coverage for the original purchaser when the shutters are properly installed, properly operated, and properly maintained.",
    ],
  },
  {
    heading: "Manufacturer warranty coverage",
    bullets: [
      "Limited lifetime warranty on shutter mechanisms.",
      "7-year warranty on paint color fastness.",
      "7-year warranty against warping and cracking.",
      "2-year warranty on color fastness for stained wood shutters.",
    ],
    paragraphs: [
      "Warranty coverage begins from the original date of purchase and applies to the original purchaser.",
    ],
  },
  {
    heading: "Manufacturer exclusions",
    bullets: [
      "Improper installation, operation, or maintenance.",
      "Abuse, misuse, customer-performed repairs, accidents, or alterations.",
      "Acts of God and normal wear and tear.",
    ],
  },
  {
    heading: "Color matching",
    paragraphs: [
      "Custom color matches and color matches between separate orders are not guaranteed due to material, finish, dye lot, and production variations. Once a custom color sample has been approved, resulting color variation is not covered by the manufacturer warranty.",
      "If a warranty concern arises, please contact 805 Shutters. We will review the concern, request photos if needed, and help coordinate the claim process with the manufacturer. Manufacturer warranty approval, repair, replacement, or remake decisions are subject to the manufacturer's review and warranty terms.",
    ],
  },
];

export const PAYMENT_AT_INSTALLATION_SECTION: CustomerContractTermSection = {
  heading: "Payment at Installation",
  paragraphs: [
    "The remaining balance is due at installation for all products installed and completed. Payment may not be withheld for corrections, manufacturer defects, warranty claims, shipping damage, or other open issues. Any issue will be handled through the appropriate correction, service, or manufacturer warranty process, but the balance for installed products remains due.",
    "Approved in-house payment plans split the remaining balance into 3 monthly payments, with the first payment due at installation. An in-house plan must be approved by 805 Shutters in writing before it applies.",
  ],
};

export function customerContractTerms(hasOnyxShutters: boolean): CustomerContractTerms {
  return {
    version: "2026-09-16",
    sections: [
      ...(hasOnyxShutters ? SHUTTER_MANUFACTURER_WARRANTY_SECTIONS : []),
      PAYMENT_AT_INSTALLATION_SECTION,
    ].map((section) => ({
      ...section,
      ...(section.paragraphs ? { paragraphs: [...section.paragraphs] } : {}),
      ...(section.bullets ? { bullets: [...section.bullets] } : {}),
    })),
  };
}
