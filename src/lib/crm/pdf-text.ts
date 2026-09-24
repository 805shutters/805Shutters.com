/** Node/serverless PDF bootstrap. The worker installs DOMMatrix before PDF.js loads. */
export async function extractPdfTextBuffer(buffer: Buffer): Promise<string> {
  const { CanvasFactory, getData } = await import("pdf-parse/worker");
  const { PDFParse } = await import("pdf-parse");
  PDFParse.setWorker(getData());
  const parser = new PDFParse({ data: buffer, CanvasFactory });
  try {
    // Invoice totals and line references can be on the last page.
    const result = await parser.getText({ pageJoiner: "\n" });
    if (!result.text.trim()) throw new Error("PDF contains no extractable text; document review required.");
    return result.text.replace(/\r/g, "\n").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  } finally {
    await parser.destroy();
  }
}
