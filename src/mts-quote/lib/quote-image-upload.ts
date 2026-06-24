/**
 * R2 Upload Helper
 * Client-side utility for uploading files to Cloudflare R2 via edge function
 */

export interface R2UploadResult {
  success: boolean;
  url?: string;
  key?: string;
  fileName?: string;
  folder?: string;
  error?: string;
}

export type R2Folder = "crm-documents" | "crm-photos" | "measure-photos" | "job-documents";

interface NormalizeUploadInput {
  key?: unknown;
  url?: unknown;
}

interface NormalizeUploadOutput {
  key: string | null;
  url: string | null;
  error: string | null;
}

function isProbablyHttpUrl(value: string): boolean {
  return value.startsWith("http://") || value.startsWith("https://");
}

function isLocalTempPath(value: string): boolean {
  if (!value) return false;
  const lower = value.toLowerCase();
  return (
    lower.startsWith("/tmp/") ||
    lower.startsWith("file://") ||
    lower.includes("/tmp/openclaw/uploads/")
  );
}

function extractKeyFromHttpUrl(urlString: string): string | null {
  try {
    const parsed = new URL(urlString);
    const pathname = parsed.pathname.replace(/^\/+/, "");
    return pathname || null;
  } catch {
    return null;
  }
}

export function normalizeR2UploadResponse(input: NormalizeUploadInput): NormalizeUploadOutput {
  const rawKey = typeof input.key === "string" ? input.key.trim() : "";
  const rawUrl = typeof input.url === "string" ? input.url.trim() : "";

  const normalizedUrl =
    rawUrl && !isLocalTempPath(rawUrl) && isProbablyHttpUrl(rawUrl) ? rawUrl : null;

  let normalizedKey: string | null = null;

  if (rawKey && !isLocalTempPath(rawKey)) {
    if (isProbablyHttpUrl(rawKey)) {
      normalizedKey = extractKeyFromHttpUrl(rawKey);
    } else {
      normalizedKey = rawKey.replace(/^\/+/, "");
    }
  }

  if (!normalizedKey && normalizedUrl) {
    normalizedKey = extractKeyFromHttpUrl(normalizedUrl);
  }

  if (!normalizedUrl || !normalizedKey) {
    return {
      key: null,
      url: null,
      error:
        "Upload returned a local temp path or invalid URL/key. Please retry upload so a durable R2 URL is stored instead of a local temp path.",
    };
  }

  return {
    key: normalizedKey,
    url: normalizedUrl,
    error: null,
  };
}

/**
 * Upload a file to R2 storage
 * @param file - The file to upload
 * @param folder - The target folder (maps to old bucket names)
 * @param jobId - Optional job ID for organizing files
 * @returns Upload result with URL
 */
export async function uploadToR2(
  file: File,
  folder: R2Folder,
  jobId?: string
): Promise<R2UploadResult> {
  void file;
  void folder;
  void jobId;
  return {
    success: false,
    error: "805 quote image upload is not wired yet.",
  };
}

/**
 * Upload multiple files to R2 storage
 * @param files - Array of files to upload
 * @param folder - The target folder
 * @param jobId - Optional job ID
 * @returns Array of upload results
 */
export async function uploadMultipleToR2(
  files: File[],
  folder: R2Folder,
  jobId?: string
): Promise<R2UploadResult[]> {
  const results = await Promise.all(files.map((file) => uploadToR2(file, folder, jobId)));
  return results;
}

/**
 * Upload a Blob to R2 storage
 * @param blob - The blob to upload
 * @param fileName - The file name
 * @param folder - The target folder
 * @param jobId - Optional job ID
 * @returns Upload result with URL
 */
export async function uploadBlobToR2(
  blob: Blob,
  fileName: string,
  folder: R2Folder,
  jobId?: string
): Promise<R2UploadResult> {
  const file = new File([blob], fileName, { type: blob.type });
  return uploadToR2(file, folder, jobId);
}
