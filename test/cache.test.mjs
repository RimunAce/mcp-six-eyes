import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { VisionCache } from "../build/cache.js";
import { TINY_JPEG, labeledFixture } from "./helpers.mjs";

function jpegFixture() {
  const base64 = TINY_JPEG.toString("base64");
  return {
    label: "1",
    source: "pixel.jpg",
    mimeType: "image/jpeg",
    bytes: TINY_JPEG,
    base64,
    dataUrl: `data:image/jpeg;base64,${base64}`,
  };
}

function request(overrides = {}) {
  return {
    task: "describe",
    prompt: "Describe this image thoroughly.",
    images: [labeledFixture("1", "a.png")],
    ...overrides,
  };
}

function result(text = "a description") {
  return { text, provider: "openai", model: "gpt-4o-mini" };
}

describe("VisionCache", () => {
  it("produces a stable 64-char key for identical requests", () => {
    const cache = new VisionCache(10);
    const a = cache.key(request());
    const b = cache.key(request());
    assert.equal(a, b);
    assert.match(a, /^[0-9a-f]{64}$/);
  });

  it("changes key when task, prompt, maxTokens, or bytes change", () => {
    const cache = new VisionCache(10);
    const base = cache.key(request());
    assert.notEqual(base, cache.key(request({ task: "analyze" })));
    assert.notEqual(base, cache.key(request({ prompt: "different" })));
    assert.notEqual(base, cache.key(request({ maxTokens: 512 })));
    assert.notEqual(base, cache.key(request({ images: [jpegFixture()] })));
  });

  it("changes key when image order changes", () => {
    const cache = new VisionCache(10);
    const two = {
      task: "compare",
      prompt: "compare",
      images: [labeledFixture("1", "a.png"), labeledFixture("2", "b.png")],
    };
    const swapped = {
      ...two,
      images: [labeledFixture("2", "b.png"), labeledFixture("1", "a.png")],
    };
    assert.notEqual(cache.key(two), cache.key(swapped));
  });

  it("stores and returns results", () => {
    const cache = new VisionCache(10);
    const key = cache.key(request());
    assert.equal(cache.get(key), undefined);
    cache.set(key, result("hello"));
    assert.deepEqual(cache.get(key), result("hello"));
  });

  it("evicts the oldest entry past maxEntries", () => {
    const cache = new VisionCache(2);
    const k1 = cache.key(request({ prompt: "one" }));
    const k2 = cache.key(request({ prompt: "two" }));
    const k3 = cache.key(request({ prompt: "three" }));
    cache.set(k1, result("1"));
    cache.set(k2, result("2"));
    cache.set(k3, result("3"));
    assert.equal(cache.get(k1), undefined);
    assert.equal(cache.get(k2).text, "2");
    assert.equal(cache.get(k3).text, "3");
  });

  it("is disabled at maxEntries 0", () => {
    const cache = new VisionCache(0);
    assert.equal(cache.enabled, false);
    const key = cache.key(request());
    cache.set(key, result());
    assert.equal(cache.get(key), undefined);
  });
});
