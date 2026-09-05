import { File } from "node:buffer";
import { describe, expect, it, vi } from "vitest";
import {
  detectMobileQuotePhotoMime,
  listMobileQuotePhotos,
  uploadMobileQuotePhoto,
} from "./mobile-quote-photos";

const QUOTE_ID = "11111111-1111-4111-8111-111111111111";
const LINE_ID = "22222222-2222-4222-8222-222222222222";
const OTHER_LINE_ID = "66666666-6666-4666-8666-666666666666";
const PHOTO_ID = "33333333-3333-4333-8333-333333333333";
const ACTOR_ID = "44444444-4444-4444-8444-444444444444";

const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

function photoFile(bytes = png, type = "image/png") {
  return new File([bytes], "window.png", { type }) as unknown as globalThis.File;
}

function database(options: Readonly<{
  owner?: string;
  deleted?: boolean;
  validLineIds?: readonly string[];
  uploadFailures?: number;
}> = {}) {
  const owner = options.owner ?? ACTOR_ID;
  const validLineIds = options.validLineIds ?? [LINE_ID];
  let uploadFailures = options.uploadFailures ?? 0;
  const photos = new Map<string, Record<string, unknown>>();
  const upload = vi.fn(async () => {
    if (uploadFailures > 0) {
      uploadFailures -= 1;
      return { data: null, error: { message: "temporary storage failure" } };
    }
    return { data: { path: "stored" }, error: null };
  });
  const createSignedUrl = vi.fn().mockResolvedValue({ data: { signedUrl: "https://signed.invalid/photo" }, error: null });

  function from(table: string) {
    let filters: Record<string, unknown> = {};
    let inserted: Record<string, unknown> | null = null;
    let updated: Record<string, unknown> | null = null;
    const builder: Record<string, unknown> = {};
    builder.select = vi.fn(() => builder);
    builder.eq = vi.fn((key: string, value: unknown) => {
      filters[key] = value;
      return builder;
    });
    builder.not = vi.fn(() => builder);
    builder.is = vi.fn((key: string, value: unknown) => {
      filters[key] = value;
      return builder;
    });
    builder.order = vi.fn(() => builder);
    builder.insert = vi.fn((value: Record<string, unknown>) => {
      inserted = value;
      return builder;
    });
    builder.update = vi.fn((value: Record<string, unknown>) => {
      updated = value;
      return builder;
    });
    const execute = () => {
      if (table === "sales_quotes") {
        const accessible =
          filters.id === QUOTE_ID &&
          filters.account_id &&
          filters.deleted_at === null &&
          !options.deleted &&
          (!filters.created_by || filters.created_by === owner);
        return { data: accessible ? { id: QUOTE_ID, account_id: filters.account_id, created_by: owner, status: "draft", quote_v2_backend: true } : null, error: null };
      }
      if (table === "sales_quote_line_items") {
        return { data: validLineIds.includes(String(filters.id)) && filters.quote_id === QUOTE_ID ? { id: filters.id } : null, error: null };
      }
      if (table === "mobile_quote_photos") {
        if (inserted) {
          if (photos.has(String(inserted.photo_id))) return { data: null, error: { code: "23505" } };
          const row = { ...inserted, uploaded_at: null, created_at: "2026-09-05T00:00:00.000Z" };
          photos.set(String(inserted.photo_id), row);
          return { data: row, error: null };
        }
        const row = photos.get(String(filters.photo_id));
        if (updated && row) {
          Object.assign(row, updated);
          return { data: row, error: null };
        }
        return { data: row ?? null, error: null };
      }
      return { data: null, error: null };
    };
    builder.maybeSingle = vi.fn(async () => execute());
    builder.single = vi.fn(async () => execute());
    builder.then = (resolve: (value: unknown) => unknown) => resolve(execute());
    return builder;
  }

  return {
    client: {
      from: vi.fn(from),
      storage: { from: vi.fn(() => ({ upload, createSignedUrl })) },
    } as never,
    photos,
    upload,
  };
}

describe("mobile quote private photos", () => {
  it("detects supported magic bytes and rejects declared MIME mismatches", async () => {
    expect(detectMobileQuotePhotoMime(png)).toBe("image/png");
    const db = database();
    await expect(uploadMobileQuotePhoto(db.client, ACTOR_ID, {
      quoteId: QUOTE_ID,
      lineItemId: LINE_ID,
      photoId: PHOTO_ID,
      file: photoFile(png, "image/jpeg"),
    })).rejects.toMatchObject({ status: 415 });
    expect(db.upload).not.toHaveBeenCalled();
  });

  it("rejects empty and oversized photos before database or storage writes", async () => {
    const db = database();
    await expect(uploadMobileQuotePhoto(db.client, ACTOR_ID, {
      quoteId: QUOTE_ID, lineItemId: LINE_ID, photoId: PHOTO_ID, file: photoFile(new Uint8Array(), "image/png"),
    })).rejects.toMatchObject({ status: 413 });
    await expect(uploadMobileQuotePhoto(db.client, ACTOR_ID, {
      quoteId: QUOTE_ID, lineItemId: LINE_ID, photoId: PHOTO_ID,
      file: photoFile(new Uint8Array(2 * 1024 * 1024 + 1), "image/png"),
    })).rejects.toMatchObject({ status: 413 });
    expect(db.upload).not.toHaveBeenCalled();
  });

  it("requires draft ownership", async () => {
    const otherOwner = "55555555-5555-4555-8555-555555555555";
    const db = database({ owner: otherOwner });
    await expect(uploadMobileQuotePhoto(db.client, ACTOR_ID, {
      quoteId: QUOTE_ID, lineItemId: LINE_ID, photoId: PHOTO_ID, file: photoFile(),
    })).rejects.toMatchObject({ status: 404 });
    expect(db.photos.size).toBe(0);
    expect(db.upload).not.toHaveBeenCalled();
  });

  it("rejects soft-deleted quotes for both upload and read", async () => {
    const db = database({ deleted: true });
    await expect(uploadMobileQuotePhoto(db.client, ACTOR_ID, {
      quoteId: QUOTE_ID, lineItemId: LINE_ID, photoId: PHOTO_ID, file: photoFile(),
    })).rejects.toMatchObject({ status: 404 });
    await expect(listMobileQuotePhotos(db.client, ACTOR_ID, { quoteId: QUOTE_ID }))
      .rejects.toMatchObject({ status: 404 });
    expect(db.photos.size).toBe(0);
    expect(db.upload).not.toHaveBeenCalled();
  });

  it("rejects a line that does not belong to the quote", async () => {
    const db = database();
    await expect(uploadMobileQuotePhoto(db.client, ACTOR_ID, {
      quoteId: QUOTE_ID, lineItemId: OTHER_LINE_ID, photoId: PHOTO_ID, file: photoFile(),
    })).rejects.toMatchObject({ status: 404, message: expect.stringMatching(/does not belong/i) });
    expect(db.photos.size).toBe(0);
    expect(db.upload).not.toHaveBeenCalled();
  });

  it("recovers from an object upload failure with the same reserved photoId", async () => {
    const db = database({ uploadFailures: 1 });
    const input = { quoteId: QUOTE_ID, lineItemId: LINE_ID, photoId: PHOTO_ID, file: photoFile() };
    await expect(uploadMobileQuotePhoto(db.client, ACTOR_ID, input))
      .rejects.toMatchObject({ status: 502, message: expect.stringMatching(/could not be uploaded/i) });
    expect(db.photos.size).toBe(1);
    await expect(uploadMobileQuotePhoto(db.client, ACTOR_ID, input)).resolves.toMatchObject({
      idempotent: false,
      photo: { photoId: PHOTO_ID },
    });
    expect(db.upload).toHaveBeenCalledTimes(2);
  });

  it("retries identical bytes idempotently without a second object upload", async () => {
    const db = database();
    const input = { quoteId: QUOTE_ID, lineItemId: LINE_ID, photoId: PHOTO_ID, file: photoFile() };
    await expect(uploadMobileQuotePhoto(db.client, ACTOR_ID, input)).resolves.toMatchObject({ idempotent: false });
    await expect(uploadMobileQuotePhoto(db.client, ACTOR_ID, input)).resolves.toMatchObject({ idempotent: true });
    expect(db.upload).toHaveBeenCalledTimes(1);
    expect(db.upload).toHaveBeenCalledWith(
      expect.stringContaining(`/${QUOTE_ID}/${LINE_ID}/${PHOTO_ID}`),
      expect.any(Uint8Array),
      expect.objectContaining({ cacheControl: "0", contentType: "image/png", upsert: true }),
    );
    expect(db.photos.size).toBe(1);
  });

  it("rejects the same photoId when its quote-line binding changes", async () => {
    const db = database({ validLineIds: [LINE_ID, OTHER_LINE_ID] });
    await uploadMobileQuotePhoto(db.client, ACTOR_ID, {
      quoteId: QUOTE_ID, lineItemId: LINE_ID, photoId: PHOTO_ID, file: photoFile(),
    });
    await expect(uploadMobileQuotePhoto(db.client, ACTOR_ID, {
      quoteId: QUOTE_ID, lineItemId: OTHER_LINE_ID, photoId: PHOTO_ID, file: photoFile(),
    })).rejects.toMatchObject({ status: 409, message: expect.stringMatching(/different photo bytes or quote data/i) });
    expect(db.upload).toHaveBeenCalledTimes(1);
  });

  it("rejects the same photoId with different bytes", async () => {
    const db = database();
    await uploadMobileQuotePhoto(db.client, ACTOR_ID, {
      quoteId: QUOTE_ID, lineItemId: LINE_ID, photoId: PHOTO_ID, file: photoFile(),
    });
    const differentPng = new Uint8Array([...png, 1]);
    await expect(uploadMobileQuotePhoto(db.client, ACTOR_ID, {
      quoteId: QUOTE_ID, lineItemId: LINE_ID, photoId: PHOTO_ID, file: photoFile(differentPng),
    })).rejects.toMatchObject({ status: 409 });
    expect(db.upload).toHaveBeenCalledTimes(1);
  });
});
