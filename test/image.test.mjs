import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { describe, it } from "node:test";

import {
  formatImageInventory,
  loadImageFromSource,
  loadLabeledImages,
  normalizeImageInputs,
} from "../build/image.js";
import {
  TINY_JPEG,
  TINY_PNG,
  TINY_PNG_DATA_URL,
  withTempDir,
  writeTempPng,
  binaryResponse,
} from "./helpers.mjs";

describe("normalizeImageInputs", () => {
  it("accepts a single image string", () => {
    const inputs = normalizeImageInputs({ image: "./a.png" });
    assert.deepEqual(inputs, [{ source: "./a.png", mimeType: undefined }]);
  });

  it("accepts string and object entries in images", () => {
    const inputs = normalizeImageInputs({
      images: [
        "./a.png",
        { source: "./b.png", label: "2", mimeType: "image/png" },
      ],
    });
    assert.equal(inputs.length, 2);
    assert.equal(inputs[0].source, "./a.png");
    assert.equal(inputs[1].label, "2");
    assert.equal(inputs[1].mimeType, "image/png");
  });

  it("merges images array before single image", () => {
    const inputs = normalizeImageInputs({
      images: ["./a.png"],
      image: "./b.png",
      mimeType: "image/jpeg",
    });
    assert.equal(inputs.length, 2);
    assert.equal(inputs[0].source, "./a.png");
    assert.equal(inputs[1].source, "./b.png");
    assert.equal(inputs[1].mimeType, "image/jpeg");
  });

  it("rejects empty input", () => {
    assert.throws(() => normalizeImageInputs({}), /Provide "image"/);
  });

  it("rejects invalid images entries", () => {
    assert.throws(
      () => normalizeImageInputs({ images: [{ label: "1" }] }),
      /source string/,
    );
  });
});

describe("loadImageFromSource", () => {
  it("loads a local PNG and detects MIME from magic bytes", async () => {
    await withTempDir(async (dir) => {
      const filePath = await writeTempPng(dir, "pixel.png");
      const image = await loadImageFromSource(filePath, {
        maxImageBytes: 1_000_000,
      });
      assert.equal(image.mimeType, "image/png");
      assert.equal(image.bytes.length, TINY_PNG.length);
      assert.equal(image.base64, TINY_PNG.toString("base64"));
      assert.match(image.dataUrl, /^data:image\/png;base64,/);
      assert.equal(image.source, path.resolve(filePath));
    });
  });

  it("loads file:// URIs", async () => {
    await withTempDir(async (dir) => {
      const filePath = await writeTempPng(dir);
      const image = await loadImageFromSource(pathToFileURL(filePath).href, {
        maxImageBytes: 1_000_000,
      });
      assert.equal(image.mimeType, "image/png");
    });
  });

  it("loads data URLs", async () => {
    const image = await loadImageFromSource(TINY_PNG_DATA_URL, {
      maxImageBytes: 1_000_000,
    });
    assert.equal(image.mimeType, "image/png");
    assert.equal(image.bytes.length, TINY_PNG.length);
  });

  it("loads bare base64 when mimeType is provided", async () => {
    const image = await loadImageFromSource(TINY_PNG.toString("base64"), {
      maxImageBytes: 1_000_000,
      mimeType: "image/png",
    });
    assert.equal(image.mimeType, "image/png");
  });

  it("detects JPEG magic bytes", async () => {
    await withTempDir(async (dir) => {
      const filePath = path.join(dir, "pixel.jpg");
      const { writeFile } = await import("node:fs/promises");
      await writeFile(filePath, TINY_JPEG);
      const image = await loadImageFromSource(filePath, {
        maxImageBytes: 1_000_000,
      });
      assert.equal(image.mimeType, "image/jpeg");
    });
  });

  it("rejects empty sources", async () => {
    await assert.rejects(
      () => loadImageFromSource("   ", { maxImageBytes: 1000 }),
      /empty/i,
    );
  });

  it("rejects oversized images", async () => {
    await withTempDir(async (dir) => {
      const filePath = await writeTempPng(dir);
      await assert.rejects(
        () => loadImageFromSource(filePath, { maxImageBytes: 10 }),
        /too large/i,
      );
    });
  });

  it("rejects non-image local files", async () => {
    await withTempDir(async (dir) => {
      const filePath = path.join(dir, "notes.txt");
      const { writeFile } = await import("node:fs/promises");
      await writeFile(filePath, "not an image");
      await assert.rejects(
        () => loadImageFromSource(filePath, { maxImageBytes: 1_000_000 }),
        /Unsupported or undetected image type/,
      );
    });
  });

  it("downloads http(s) images", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => binaryResponse(TINY_PNG, "image/png");
    try {
      const image = await loadImageFromSource("https://example.com/a.png", {
        maxImageBytes: 1_000_000,
      });
      assert.equal(image.mimeType, "image/png");
      assert.equal(image.source, "https://example.com/a.png");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("surfaces failed downloads", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () =>
      new Response("missing", { status: 404, statusText: "Not Found" });
    try {
      await assert.rejects(
        () =>
          loadImageFromSource("https://example.com/missing.png", {
            maxImageBytes: 1_000_000,
          }),
        /Failed to download image \(404/,
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe("loadLabeledImages", () => {
  it("assigns default labels 1..n", async () => {
    await withTempDir(async (dir) => {
      const a = await writeTempPng(dir, "a.png");
      const b = await writeTempPng(dir, "b.png");
      const labeled = await loadLabeledImages(
        [{ source: a }, { source: b }],
        { maxImageBytes: 1_000_000, maxImages: 10 },
      );
      assert.deepEqual(
        labeled.map((img) => img.label),
        ["1", "2"],
      );
    });
  });

  it("keeps custom labels and strips Image prefix", async () => {
    await withTempDir(async (dir) => {
      const a = await writeTempPng(dir, "a.png");
      const labeled = await loadLabeledImages(
        [{ source: a, label: "Image before" }],
        { maxImageBytes: 1_000_000, maxImages: 10 },
      );
      assert.equal(labeled[0].label, "before");
    });
  });

  it("deduplicates colliding labels", async () => {
    await withTempDir(async (dir) => {
      const a = await writeTempPng(dir, "a.png");
      const b = await writeTempPng(dir, "b.png");
      const labeled = await loadLabeledImages(
        [
          { source: a, label: "1" },
          { source: b, label: "1" },
        ],
        { maxImageBytes: 1_000_000, maxImages: 10 },
      );
      assert.equal(labeled[0].label, "1");
      assert.equal(labeled[1].label, "1-2");
    });
  });

  it("enforces maxImages", async () => {
    await withTempDir(async (dir) => {
      const a = await writeTempPng(dir, "a.png");
      const b = await writeTempPng(dir, "b.png");
      await assert.rejects(
        () =>
          loadLabeledImages([{ source: a }, { source: b }], {
            maxImageBytes: 1_000_000,
            maxImages: 1,
          }),
        /Too many images/,
      );
    });
  });

  it("formats inventory lines for prompts", async () => {
    await withTempDir(async (dir) => {
      const a = await writeTempPng(dir, "a.png");
      const labeled = await loadLabeledImages([{ source: a, label: "hero" }], {
        maxImageBytes: 1_000_000,
        maxImages: 10,
      });
      const inventory = formatImageInventory(labeled);
      assert.match(inventory, /Image hero:/);
      assert.match(inventory, /image\/png/);
    });
  });
});

describe("fixture integrity", () => {
  it("ships a real logo asset", async () => {
    const logoPath = path.resolve("assets/logo.png");
    const bytes = await readFile(logoPath);
    assert.ok(bytes.length > 1000);
    assert.equal(bytes[0], 0x89);
    assert.equal(bytes[1], 0x50);
  });
});
