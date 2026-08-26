import { deflateSync, inflateSync } from "node:zlib";

export type ImageDetail = "auto" | "low" | "original";

export interface PreprocessableImage {
  bytes: Buffer;
  mimeType: string;
  source: string;
  base64: string;
  dataUrl: string;
}

export interface ImageSize {
  width: number;
  height: number;
}

const LOW_EDGE = 512;

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

export function edgeForDetail(
  detail: ImageDetail,
  maxEdge: number,
): number | undefined {
  if (detail === "original") return undefined;
  if (detail === "low") return LOW_EDGE;
  return maxEdge;
}

export function readImageSize(bytes: Buffer, mimeType?: string): ImageSize | undefined {
  if (mimeType === "image/png" || isPng(bytes)) return readPngSize(bytes);
  if (mimeType === "image/jpeg" || isJpeg(bytes)) return readJpegSize(bytes);
  if (mimeType === "image/gif" || isGif(bytes)) return readGifSize(bytes);
  if (mimeType === "image/webp" || isWebp(bytes)) return readWebpSize(bytes);
  if (mimeType === "image/bmp" || isBmp(bytes)) return readBmpSize(bytes);
  return undefined;
}

export function stripJpegExif(bytes: Buffer): Buffer {
  if (!isJpeg(bytes) || bytes.length < 4) return bytes;
  const out: Buffer[] = [bytes.subarray(0, 2)];
  let i = 2;
  while (i < bytes.length) {
    if (bytes[i] !== 0xff) return bytes;
    while (i < bytes.length && bytes[i] === 0xff) i += 1;
    if (i >= bytes.length) break;
    const marker = bytes[i++];
    if (marker === 0xda) {
      out.push(Buffer.from([0xff, marker]), bytes.subarray(i));
      return Buffer.concat(out);
    }
    if (marker === 0xd9) {
      out.push(Buffer.from([0xff, 0xd9]));
      return Buffer.concat(out);
    }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      out.push(Buffer.from([0xff, marker]));
      continue;
    }
    if (i + 2 > bytes.length) return bytes;
    const len = bytes.readUInt16BE(i);
    if (len < 2 || i + len > bytes.length) return bytes;
    if (marker !== 0xe1) {
      out.push(Buffer.from([0xff, marker]), bytes.subarray(i, i + len));
    }
    i += len;
  }
  return Buffer.concat(out);
}

export function encodePngRgba(
  width: number,
  height: number,
  rgba: Buffer,
): Buffer {
  if (rgba.length !== width * height * 4) {
    throw new Error("RGBA buffer length does not match width*height*4.");
  }
  const raw = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    const dest = y * (1 + width * 4);
    raw[dest] = 0;
    rgba.copy(raw, dest + 1, y * width * 4, (y + 1) * width * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return Buffer.concat([
    signature,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(raw)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

export function tryDownscalePng(bytes: Buffer, maxEdge: number): Buffer | undefined {
  const parsed = decodePng(bytes);
  if (!parsed) return undefined;
  const longest = Math.max(parsed.width, parsed.height);
  if (longest <= maxEdge) return bytes;

  const scale = maxEdge / longest;
  const width = Math.max(1, Math.round(parsed.width * scale));
  const height = Math.max(1, Math.round(parsed.height * scale));
  if (width === parsed.width && height === parsed.height) return bytes;

  const dest = Buffer.alloc(width * height * parsed.bpp);
  for (let y = 0; y < height; y++) {
    const srcY = Math.min(
      parsed.height - 1,
      Math.floor((y * parsed.height) / height),
    );
    for (let x = 0; x < width; x++) {
      const srcX = Math.min(
        parsed.width - 1,
        Math.floor((x * parsed.width) / width),
      );
      const srcOff = (srcY * parsed.width + srcX) * parsed.bpp;
      const destOff = (y * width + x) * parsed.bpp;
      parsed.pixels.copy(dest, destOff, srcOff, srcOff + parsed.bpp);
    }
  }

  return encodePngDecoded(width, height, dest, parsed);
}

export function preprocessLoadedImage<T extends PreprocessableImage>(
  image: T,
  options: { detail: ImageDetail; maxEdge: number; maxImageBytes: number },
): T {
  let bytes = image.bytes;
  let mimeType = image.mimeType;

  if (mimeType === "image/jpeg" || isJpeg(bytes)) {
    bytes = stripJpegExif(bytes);
    mimeType = "image/jpeg";
  }

  const maxEdge = edgeForDetail(options.detail, options.maxEdge);
  if (maxEdge) {
    const size = readImageSize(bytes, mimeType);
    if (size && Math.max(size.width, size.height) > maxEdge) {
      if (mimeType === "image/png" || isPng(bytes)) {
        const resized = tryDownscalePng(bytes, maxEdge);
        if (resized) {
          bytes = resized;
          mimeType = "image/png";
        }
      }
    }
  }

  if (bytes.byteLength > options.maxImageBytes) {
    throw new Error(
      `Image too large (${bytes.byteLength} bytes) after preprocess. Max is ${options.maxImageBytes} bytes.`,
    );
  }

  if (bytes === image.bytes && mimeType === image.mimeType) {
    return image;
  }

  const base64 = bytes.toString("base64");
  return {
    ...image,
    bytes,
    mimeType,
    base64,
    dataUrl: `data:${mimeType};base64,${base64}`,
  };
}

function isPng(bytes: Buffer): boolean {
  return (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  );
}

function isJpeg(bytes: Buffer): boolean {
  return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

function isGif(bytes: Buffer): boolean {
  if (bytes.length < 6) return false;
  const header = bytes.subarray(0, 6).toString("ascii");
  return header === "GIF87a" || header === "GIF89a";
}

function isWebp(bytes: Buffer): boolean {
  return (
    bytes.length >= 12 &&
    bytes.subarray(0, 4).toString("ascii") === "RIFF" &&
    bytes.subarray(8, 12).toString("ascii") === "WEBP"
  );
}

function isBmp(bytes: Buffer): boolean {
  return bytes.length >= 2 && bytes[0] === 0x42 && bytes[1] === 0x4d;
}

function readPngSize(bytes: Buffer): ImageSize | undefined {
  if (bytes.length < 24 || !isPng(bytes)) return undefined;
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  if (!width || !height) return undefined;
  return { width, height };
}

function readJpegSize(bytes: Buffer): ImageSize | undefined {
  if (!isJpeg(bytes)) return undefined;
  let i = 2;
  while (i < bytes.length) {
    if (bytes[i] !== 0xff) return undefined;
    while (i < bytes.length && bytes[i] === 0xff) i += 1;
    if (i >= bytes.length) return undefined;
    const marker = bytes[i++];
    if (marker === 0xda || marker === 0xd9) return undefined;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (i + 2 > bytes.length) return undefined;
    const len = bytes.readUInt16BE(i);
    if (len < 2 || i + len > bytes.length) return undefined;
    const isSof =
      (marker >= 0xc0 && marker <= 0xc3) ||
      (marker >= 0xc5 && marker <= 0xc7) ||
      (marker >= 0xc9 && marker <= 0xcb) ||
      (marker >= 0xcd && marker <= 0xcf);
    if (isSof && len >= 7) {
      const height = bytes.readUInt16BE(i + 3);
      const width = bytes.readUInt16BE(i + 5);
      if (width > 0 && height > 0) return { width, height };
      return undefined;
    }
    i += len;
  }
  return undefined;
}

function readGifSize(bytes: Buffer): ImageSize | undefined {
  if (bytes.length < 10 || !isGif(bytes)) return undefined;
  const width = bytes.readUInt16LE(6);
  const height = bytes.readUInt16LE(8);
  if (!width || !height) return undefined;
  return { width, height };
}

function readBmpSize(bytes: Buffer): ImageSize | undefined {
  if (bytes.length < 26 || !isBmp(bytes)) return undefined;
  const headerSize = bytes.readUInt32LE(14);
  if (headerSize === 12 && bytes.length >= 22) {
    return { width: bytes.readUInt16LE(18), height: bytes.readUInt16LE(20) };
  }
  if (bytes.length >= 26) {
    const width = bytes.readInt32LE(18);
    const height = Math.abs(bytes.readInt32LE(22));
    if (width > 0 && height > 0) return { width, height };
  }
  return undefined;
}

function readWebpSize(bytes: Buffer): ImageSize | undefined {
  if (!isWebp(bytes) || bytes.length < 16) return undefined;
  const fourcc = bytes.subarray(12, 16).toString("ascii");
  if (fourcc === "VP8X" && bytes.length >= 30) {
    const width = 1 + bytes.readUIntLE(24, 3);
    const height = 1 + bytes.readUIntLE(27, 3);
    return { width, height };
  }
  if (fourcc === "VP8 " && bytes.length >= 30) {
    const width = bytes.readUInt16LE(26) & 0x3fff;
    const height = bytes.readUInt16LE(28) & 0x3fff;
    if (width && height) return { width, height };
  }
  if (fourcc === "VP8L" && bytes.length >= 25) {
    const bits = bytes.readUInt32LE(21);
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  return undefined;
}

interface DecodedPng {
  width: number;
  height: number;
  bitDepth: number;
  colorType: number;
  bpp: number;
  pixels: Buffer;
  extras: Buffer[];
}

function decodePng(bytes: Buffer): DecodedPng | undefined {
  if (!isPng(bytes) || bytes.length < 33) return undefined;
  let offset = 8;
  let ihdr: Buffer | undefined;
  const idat: Buffer[] = [];
  const extras: Buffer[] = [];

  while (offset + 12 <= bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.subarray(offset + 4, offset + 8).toString("ascii");
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    if (dataEnd + 4 > bytes.length) return undefined;
    const data = bytes.subarray(dataStart, dataEnd);
    if (type === "IHDR") ihdr = Buffer.from(data);
    else if (type === "IDAT") idat.push(data);
    else if (type === "IEND") break;
    else if (type === "PLTE" || type === "tRNS") extras.push(pngChunk(type, data));
    offset = dataEnd + 4;
  }

  if (!ihdr || ihdr.length < 13 || idat.length === 0) return undefined;
  const width = ihdr.readUInt32BE(0);
  const height = ihdr.readUInt32BE(4);
  const bitDepth = ihdr[8];
  const colorType = ihdr[9];
  const interlace = ihdr[12];
  if (!width || !height || bitDepth !== 8 || interlace !== 0) return undefined;

  const bpp = bytesPerPixel(colorType);
  if (!bpp) return undefined;

  let inflated: Buffer;
  try {
    inflated = inflateSync(Buffer.concat(idat));
  } catch {
    return undefined;
  }

  const stride = width * bpp;
  const expected = height * (1 + stride);
  if (inflated.length < expected) return undefined;

  const pixels = Buffer.alloc(width * height * bpp);
  let src = 0;
  let prev: Buffer | undefined;
  for (let y = 0; y < height; y++) {
    const filter = inflated[src++];
    const row = inflated.subarray(src, src + stride);
    src += stride;
    const dest = pixels.subarray(y * stride, (y + 1) * stride);
    if (!unfilter(filter, row, dest, prev, bpp)) return undefined;
    prev = dest;
  }

  return { width, height, bitDepth, colorType, bpp, pixels, extras };
}

function encodePngDecoded(
  width: number,
  height: number,
  pixels: Buffer,
  meta: Pick<DecodedPng, "colorType" | "bpp" | "extras">,
): Buffer {
  const stride = width * meta.bpp;
  const raw = Buffer.alloc(height * (1 + stride));
  for (let y = 0; y < height; y++) {
    const dest = y * (1 + stride);
    raw[dest] = 0;
    pixels.copy(raw, dest + 1, y * stride, (y + 1) * stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = meta.colorType;
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return Buffer.concat([
    signature,
    pngChunk("IHDR", ihdr),
    ...meta.extras,
    pngChunk("IDAT", deflateSync(raw)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

function bytesPerPixel(colorType: number): number | undefined {
  switch (colorType) {
    case 0:
      return 1;
    case 2:
      return 3;
    case 3:
      return 1;
    case 4:
      return 2;
    case 6:
      return 4;
    default:
      return undefined;
  }
}

function unfilter(
  filter: number,
  row: Buffer,
  dest: Buffer,
  prev: Buffer | undefined,
  bpp: number,
): boolean {
  if (filter === 0) {
    row.copy(dest);
    return true;
  }
  for (let i = 0; i < row.length; i++) {
    const raw = row[i];
    const a = i >= bpp ? dest[i - bpp] : 0;
    const b = prev ? prev[i] : 0;
    const c = prev && i >= bpp ? prev[i - bpp] : 0;
    if (filter === 1) dest[i] = (raw + a) & 255;
    else if (filter === 2) dest[i] = (raw + b) & 255;
    else if (filter === 3) dest[i] = (raw + Math.floor((a + b) / 2)) & 255;
    else if (filter === 4) dest[i] = (raw + paeth(a, b, c)) & 255;
    else return false;
  }
  return true;
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const typeBuf = Buffer.from(type, "ascii");
  const header = Buffer.alloc(4);
  header.writeUInt32BE(data.length);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([header, typeBuf, data, crcBuf]);
}
