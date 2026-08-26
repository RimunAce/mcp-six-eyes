import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  encodePngRgba,
  preprocessLoadedImage,
  readImageSize,
  stripJpegExif,
  tryDownscalePng,
} from "../build/resize.js";
import { TINY_JPEG, TINY_PNG } from "./helpers.mjs";

function loaded(bytes, mimeType) {
  const base64 = bytes.toString("base64");
  return {
    bytes,
    mimeType,
    source: "fixture",
    base64,
    dataUrl: `data:${mimeType};base64,${base64}`,
  };
}

describe("image preprocess", () => {
  it("reads PNG and JPEG dimensions", () => {
    const png = encodePngRgba(8, 4, Buffer.alloc(8 * 4 * 4, 80));
    assert.deepEqual(readImageSize(png, "image/png"), { width: 8, height: 4 });
    assert.deepEqual(readImageSize(TINY_PNG, "image/png"), { width: 1, height: 1 });
    assert.deepEqual(readImageSize(TINY_JPEG, "image/jpeg"), { width: 1, height: 1 });
  });

  it("downscales PNG so the longest edge fits", () => {
    const pixels = Buffer.alloc(16 * 8 * 4, 40);
    const png = encodePngRgba(16, 8, pixels);
    const resized = tryDownscalePng(png, 8);
    assert.ok(resized);
    assert.deepEqual(readImageSize(resized, "image/png"), { width: 8, height: 4 });
  });

  it("strips JPEG APP1 EXIF without a library", () => {
    const jpeg = Buffer.from([
      0xff, 0xd8,
      0xff, 0xe1, 0x00, 0x08, 0x45, 0x78, 0x69, 0x66, 0x00, 0x00,
      0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x01, 0x00, 0x01, 0x01, 0x01, 0x11, 0x00,
      0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00,
      0xff, 0xd9,
    ]);
    const stripped = stripJpegExif(jpeg);
    assert.equal(stripped.includes(Buffer.from("Exif")), false);
    assert.deepEqual(readImageSize(stripped, "image/jpeg"), { width: 1, height: 1 });
  });

  it("applies detail=low and leaves original untouched", () => {
    const png = encodePngRgba(20, 10, Buffer.alloc(20 * 10 * 4, 10));
    const low = preprocessLoadedImage(loaded(png, "image/png"), {
      detail: "low",
      maxEdge: 2048,
      maxImageBytes: 1_000_000,
    });
    assert.deepEqual(readImageSize(low.bytes, "image/png"), { width: 20, height: 10 });

    const bigger = encodePngRgba(600, 100, Buffer.alloc(600 * 100 * 4, 7));
    const reduced = preprocessLoadedImage(loaded(bigger, "image/png"), {
      detail: "low",
      maxEdge: 2048,
      maxImageBytes: 5_000_000,
    });
    const size = readImageSize(reduced.bytes, "image/png");
    assert.ok(size);
    assert.ok(Math.max(size.width, size.height) <= 512);

    const original = preprocessLoadedImage(loaded(bigger, "image/png"), {
      detail: "original",
      maxEdge: 64,
      maxImageBytes: 5_000_000,
    });
    assert.equal(original.bytes.length, bigger.length);
  });
});
