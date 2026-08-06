import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export interface LoadedImage {
  bytes: Buffer;
  mimeType: string;
  source: string;
  base64: string;
  dataUrl: string;
}

/** Loaded image plus a stable label agents can refer to ("1", "before", "fig-a"). */
export interface LabeledImage extends LoadedImage {
  label: string;
}

export interface ImageInput {
  source: string;
  label?: string;
  mimeType?: string;
}

const EXT_TO_MIME: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".bmp": "image/bmp",
  ".tif": "image/tiff",
  ".tiff": "image/tiff",
  ".svg": "image/svg+xml",
};

const MAGIC: Array<{ mime: string; test: (b: Buffer) => boolean }> = [
  {
    mime: "image/png",
    test: (b) =>
      b.length >= 8 &&
      b[0] === 0x89 &&
      b[1] === 0x50 &&
      b[2] === 0x4e &&
      b[3] === 0x47,
  },
  {
    mime: "image/jpeg",
    test: (b) => b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  },
  {
    mime: "image/gif",
    test: (b) => {
      if (b.length < 6) return false;
      const header = b.subarray(0, 6).toString("ascii");
      return header === "GIF87a" || header === "GIF89a";
    },
  },
  {
    mime: "image/webp",
    test: (b) =>
      b.length >= 12 &&
      b.subarray(0, 4).toString("ascii") === "RIFF" &&
      b.subarray(8, 12).toString("ascii") === "WEBP",
  },
  {
    mime: "image/bmp",
    test: (b) => b.length >= 2 && b[0] === 0x42 && b[1] === 0x4d,
  },
];

function detectMime(bytes: Buffer, hint?: string): string {
  if (hint && hint.startsWith("image/")) return hint;
  for (const entry of MAGIC) {
    if (entry.test(bytes)) return entry.mime;
  }
  if (hint) return hint;
  return "application/octet-stream";
}

function mimeFromPath(filePath: string): string | undefined {
  return EXT_TO_MIME[path.extname(filePath).toLowerCase()];
}

function assertSize(bytes: Buffer, maxImageBytes: number, source: string): void {
  if (bytes.byteLength > maxImageBytes) {
    throw new Error(
      `Image too large (${bytes.byteLength} bytes) from ${source}. Max is ${maxImageBytes} bytes.`,
    );
  }
  if (bytes.byteLength === 0) {
    throw new Error(`Image is empty: ${source}`);
  }
}

function toLoaded(
  bytes: Buffer,
  mimeType: string,
  source: string,
  maxImageBytes: number,
): LoadedImage {
  assertSize(bytes, maxImageBytes, source);
  const mime = detectMime(bytes, mimeType);
  if (!mime.startsWith("image/")) {
    throw new Error(
      `Unsupported or undetected image type for ${source}. Got MIME "${mime}".`,
    );
  }
  const base64 = bytes.toString("base64");
  return {
    bytes,
    mimeType: mime,
    source,
    base64,
    dataUrl: `data:${mime};base64,${base64}`,
  };
}

function stripDataUrl(input: string): { mimeType?: string; base64: string } {
  const match = /^data:([^;]+);base64,(.+)$/is.exec(input.trim());
  if (match) {
    return { mimeType: match[1], base64: match[2].replace(/\s+/g, "") };
  }
  return { base64: input.replace(/\s+/g, "") };
}

function resolveLocalPath(input: string): string {
  const trimmed = input.trim();
  if (trimmed.startsWith("file://")) {
    return fileURLToPath(trimmed);
  }
  return path.resolve(trimmed);
}

export async function loadImageFromSource(
  source: string,
  options: {
    maxImageBytes: number;
    mimeType?: string;
    timeoutMs?: number;
  },
): Promise<LoadedImage> {
  const input = source.trim();
  if (!input) {
    throw new Error("Image source is empty.");
  }

  // Data URLs (image/* or otherwise).
  if (input.startsWith("data:")) {
    const parsed = stripDataUrl(input);
    const bytes = Buffer.from(parsed.base64, "base64");
    return toLoaded(
      bytes,
      options.mimeType ?? parsed.mimeType ?? "application/octet-stream",
      "data-url",
      options.maxImageBytes,
    );
  }

  // Bare base64: require an explicit MIME hint, or a long base64-looking payload.
  const looksLikeBase64 = /^[A-Za-z0-9+/=\r\n]+$/.test(input);
  if (looksLikeBase64 && (options.mimeType || input.length > 256)) {
    const parsed = stripDataUrl(input);
    const bytes = Buffer.from(parsed.base64, "base64");
    return toLoaded(
      bytes,
      options.mimeType ?? parsed.mimeType ?? "application/octet-stream",
      "base64",
      options.maxImageBytes,
    );
  }

  if (/^https?:\/\//i.test(input)) {
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(),
      options.timeoutMs ?? 60_000,
    );
    try {
      const response = await fetch(input, {
        signal: controller.signal,
        headers: { Accept: "image/*,*/*" },
      });
      if (!response.ok) {
        throw new Error(
          `Failed to download image (${response.status} ${response.statusText}): ${input}`,
        );
      }
      const contentType = response.headers
        .get("content-type")
        ?.split(";")[0]
        ?.trim();
      const arrayBuffer = await response.arrayBuffer();
      const bytes = Buffer.from(arrayBuffer);
      return toLoaded(
        bytes,
        options.mimeType ?? contentType ?? "application/octet-stream",
        input,
        options.maxImageBytes,
      );
    } finally {
      clearTimeout(timer);
    }
  }

  const filePath = resolveLocalPath(input);
  const bytes = await readFile(filePath);
  return toLoaded(
    bytes,
    options.mimeType ?? mimeFromPath(filePath) ?? "application/octet-stream",
    filePath,
    options.maxImageBytes,
  );
}

function defaultLabel(index: number): string {
  return String(index + 1);
}

/**
 * Normalize mixed tool inputs into a labeled image list.
 * Accepts plain source strings or { source, label?, mimeType? } objects.
 */
export function normalizeImageInputs(args: {
  image?: string;
  mimeType?: string;
  images?: Array<string | ImageInput>;
}): ImageInput[] {
  const out: ImageInput[] = [];

  if (Array.isArray(args.images)) {
    for (const item of args.images) {
      if (typeof item === "string") {
        out.push({ source: item });
      } else if (item && typeof item === "object" && typeof item.source === "string") {
        out.push({
          source: item.source,
          label: item.label,
          mimeType: item.mimeType,
        });
      } else {
        throw new Error(
          'Each entry in "images" must be a source string or { source, label?, mimeType? }.',
        );
      }
    }
  }

  if (typeof args.image === "string" && args.image.trim()) {
    out.push({ source: args.image, mimeType: args.mimeType });
  }

  if (out.length === 0) {
    throw new Error(
      'Provide "image" (single) and/or "images" (one or more). Example: images: ["path/a.png", "path/b.png"]',
    );
  }

  return out;
}

export async function loadLabeledImages(
  inputs: ImageInput[],
  options: {
    maxImageBytes: number;
    maxImages: number;
    timeoutMs?: number;
  },
): Promise<LabeledImage[]> {
  if (inputs.length === 0) {
    throw new Error("At least one image is required.");
  }
  if (inputs.length > options.maxImages) {
    throw new Error(
      `Too many images (${inputs.length}). Max is ${options.maxImages} (set VISION_MAX_IMAGES).`,
    );
  }

  const usedLabels = new Set<string>();
  const loaded: LabeledImage[] = [];

  for (let i = 0; i < inputs.length; i++) {
    const input = inputs[i];
    const image = await loadImageFromSource(input.source, {
      maxImageBytes: options.maxImageBytes,
      mimeType: input.mimeType,
      timeoutMs: options.timeoutMs,
    });

    let label = (input.label?.trim() || defaultLabel(i)).replace(
      /^image\s+/i,
      "",
    );
    if (!label) label = defaultLabel(i);

    // Keep labels unique so "refer to image 2" stays unambiguous.
    let unique = label;
    let suffix = 2;
    while (usedLabels.has(unique.toLowerCase())) {
      unique = `${label}-${suffix}`;
      suffix += 1;
    }
    usedLabels.add(unique.toLowerCase());

    loaded.push({ ...image, label: unique });
  }

  return loaded;
}

export function formatImageInventory(images: LabeledImage[]): string {
  return images
    .map((img) => `- Image ${img.label}: ${img.source} (${img.mimeType})`)
    .join("\n");
}
