/**
 * Lightweight smoke script kept for manual checks.
 * Prefer `npm test` for the full suite.
 */
import { pathToFileURL } from "node:url";
import {
  loadImageFromSource,
  loadLabeledImages,
  normalizeImageInputs,
} from "../build/image.js";
import { TINY_PNG, withTempDir, writeTempPng } from "../test/helpers.mjs";

await withTempDir(async (dir) => {
  const tmpA = await writeTempPng(dir, "a.png");
  const tmpB = await writeTempPng(dir, "b.png");

  const fromFile = await loadImageFromSource(tmpA, { maxImageBytes: 1_000_000 });
  const fromDataUrl = await loadImageFromSource(
    `data:image/png;base64,${TINY_PNG.toString("base64")}`,
    { maxImageBytes: 1_000_000 },
  );
  const fromFileUrl = await loadImageFromSource(pathToFileURL(tmpA).href, {
    maxImageBytes: 1_000_000,
  });

  if (fromFile.mimeType !== "image/png") throw new Error("file mime mismatch");
  if (fromDataUrl.mimeType !== "image/png") throw new Error("data url mime mismatch");
  if (fromFileUrl.mimeType !== "image/png") throw new Error("file url mime mismatch");
  if (fromFile.bytes.length !== TINY_PNG.length) throw new Error("byte length mismatch");

  const inputs = normalizeImageInputs({
    images: [
      { source: tmpA, label: "1" },
      { source: tmpB, label: "2" },
      tmpA,
    ],
  });
  if (inputs.length !== 3) throw new Error("normalize count mismatch");

  const labeled = await loadLabeledImages(inputs, {
    maxImageBytes: 1_000_000,
    maxImages: 10,
  });
  if (labeled.length !== 3) throw new Error("labeled count mismatch");
  if (labeled[0].label !== "1" || labeled[1].label !== "2") {
    throw new Error(`label mismatch: ${labeled.map((i) => i.label).join(",")}`);
  }
  if (labeled[2].label !== "3") {
    throw new Error(`expected third label "3", got "${labeled[2].label}"`);
  }

  const dual = normalizeImageInputs({
    image: tmpA,
    images: [tmpB],
  });
  if (dual.length !== 2) throw new Error("image+images merge failed");
});

console.error("smoke-load ok");
