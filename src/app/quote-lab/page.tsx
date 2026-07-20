import type { Metadata } from "next";
import { privatePageMetadata } from "@/lib/private-page-metadata";
import { QuoteLab } from "./QuoteLab";

export const metadata: Metadata = privatePageMetadata("805 Quote Lab");
export const dynamic = "force-dynamic";

export default function QuoteLabPage() {
  return <QuoteLab />;
}
