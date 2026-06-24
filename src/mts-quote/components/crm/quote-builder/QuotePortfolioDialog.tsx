/* eslint-disable @typescript-eslint/no-explicit-any */
import { useRef, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, Image as ImageIcon, Upload } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@mts/components/ui/dialog";
import { Button } from "@mts/components/ui/button";
import { supabase } from "@mts/integrations/supabase/client";
import { queryKeys } from "@mts/lib/queryKeys";
import { uploadMultipleToR2 } from "@mts/lib/quote-image-upload";
import { getPortfolioManufacturerImages, type SalesQuoteMedia } from "@mts/lib/quoteProductImages";
import type { SalesQuote, SalesQuoteDesign, SalesQuoteLineItem } from "@mts/types/quote";
import { toast } from "sonner";

interface QuotePortfolioDialogProps {
  quote: SalesQuote | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function QuotePortfolioDialog({ quote, open, onOpenChange }: QuotePortfolioDialogProps) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const quoteId = quote?.id || "";

  const { data: lineItems = [] } = useQuery({
    queryKey: [...queryKeys.salesQuotes.detail(quoteId), "portfolio-line-items"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("sales_quote_line_items")
        .select("*")
        .eq("quote_id", quoteId)
        .order("sort_order");
      if (error) throw error;
      return (data || []) as SalesQuoteLineItem[];
    },
    enabled: open && !!quoteId,
  });

  const lineItemIds = lineItems.map((item) => item.id);
  const { data: designs = [] } = useQuery({
    queryKey: [...queryKeys.salesQuotes.detail(quoteId), "portfolio-designs"],
    queryFn: async () => {
      if (lineItemIds.length === 0) return [];
      const { data, error } = await (supabase as any)
        .from("sales_quote_designs")
        .select("*")
        .in("line_item_id", lineItemIds);
      if (error) throw error;
      return (data || []) as SalesQuoteDesign[];
    },
    enabled: open && lineItemIds.length > 0,
  });

  const { data: uploadedMedia = [] } = useQuery({
    queryKey: queryKeys.salesQuotes.media(quoteId),
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("sales_quote_media")
        .select("*")
        .eq("quote_id", quoteId)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data || []) as SalesQuoteMedia[];
    },
    enabled: open && !!quoteId,
  });

  const uploadMedia = useMutation({
    mutationFn: async (files: File[]) => {
      if (!quote) return;
      setUploading(true);
      const results = await uploadMultipleToR2(files, "crm-photos", quote.id);
      const failures = results.filter((result) => !result.success);
      const successes = results.filter((result) => result.success && result.url);

      if (successes.length > 0) {
        const { data: session } = await supabase.auth.getSession();
        const rows = successes.map((result, index) => ({
          quote_id: quote.id,
          source: "uploaded",
          image_url: result.url!,
          title: result.fileName || files[index]?.name || "Project photo",
          caption: "Uploaded project photo",
          sort_order: uploadedMedia.length + index,
          created_by: session?.session?.user?.id || null,
        }));
        const { error } = await (supabase as any).from("sales_quote_media").insert(rows);
        if (error) throw error;
      }

      if (failures.length > 0) {
        throw new Error(failures[0].error || "One or more uploads failed");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.salesQuotes.media(quoteId) });
      toast.success("Portfolio photos uploaded");
    },
    onError: (error) => {
      toast.error("Upload failed: " + error.message);
    },
    onSettled: () => setUploading(false),
  });

  const manufacturerImages = getPortfolioManufacturerImages(lineItems, designs);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] max-w-5xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ImageIcon className="h-5 w-5" />
            Project Portfolio
          </DialogTitle>
          <DialogDescription>
            Product inspiration from manufacturer websites plus photos uploaded for this quote.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-slate-50 p-4">
          <div>
            <p className="font-semibold">{quote?.customer_name || "Selected quote"}</p>
            <p className="text-sm text-muted-foreground">{quote?.quote_number}</p>
          </div>
          <div>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*"
              className="hidden"
              onChange={(event) => {
                const files = Array.from(event.target.files || []);
                if (files.length > 0) uploadMedia.mutate(files);
                event.target.value = "";
              }}
            />
            <Button disabled={uploading} onClick={() => fileInputRef.current?.click()}>
              <Upload className="mr-2 h-4 w-4" />
              {uploading ? "Uploading..." : "Add Photos"}
            </Button>
          </div>
        </div>

        <PortfolioSection title="Manufacturer product photos">
          {manufacturerImages.length === 0 ? (
            <EmptyPortfolioMessage message="No manufacturer images matched this quote yet." />
          ) : (
            manufacturerImages.map((image) => (
              <PortfolioTile
                key={image.id}
                imageUrl={image.imageUrl}
                title={image.title}
                caption={image.description || image.manufacturer}
                sourceUrl={image.sourceUrl}
              />
            ))
          )}
        </PortfolioSection>

        <PortfolioSection title="Project photos">
          {uploadedMedia.length === 0 ? (
            <EmptyPortfolioMessage message="No project photos uploaded yet." />
          ) : (
            uploadedMedia.map((media) => (
              <PortfolioTile
                key={media.id}
                imageUrl={media.image_url}
                title={media.title}
                caption={media.caption || sourceLabel(media.source)}
              />
            ))
          )}
        </PortfolioSection>
      </DialogContent>
    </Dialog>
  );
}

function PortfolioSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h3 className="text-sm font-bold uppercase tracking-[0.18em] text-slate-500">{title}</h3>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{children}</div>
    </section>
  );
}

function PortfolioTile({
  imageUrl,
  title,
  caption,
  sourceUrl,
}: {
  imageUrl: string;
  title: string;
  caption?: string | null;
  sourceUrl?: string;
}) {
  return (
    <figure className="overflow-hidden rounded-2xl border bg-white shadow-sm">
      <div className="aspect-[4/3] overflow-hidden bg-slate-100">
        <img src={imageUrl} alt={title} className="h-full w-full object-cover" loading="lazy" />
      </div>
      <figcaption className="space-y-2 p-3">
        <div>
          <p className="font-semibold leading-tight text-slate-950">{title}</p>
          {caption && <p className="mt-1 text-xs text-slate-500">{caption}</p>}
        </div>
        {sourceUrl && (
          <a
            href={sourceUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-xs font-semibold text-sky-700 hover:underline"
          >
            Manufacturer source
            <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </figcaption>
    </figure>
  );
}

function EmptyPortfolioMessage({ message }: { message: string }) {
  return (
    <div className="col-span-full rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
      {message}
    </div>
  );
}

function sourceLabel(source: SalesQuoteMedia["source"]) {
  return {
    manufacturer: "Manufacturer image",
    uploaded: "Uploaded project photo",
    customer: "Customer provided",
    job_site: "Job site photo",
  }[source];
}
