import { createHash } from "node:crypto";

import type { VisionRequest, VisionResult } from "./providers/types.js";

const SEP = "\u0000";

/**
 * Content-addressed, in-memory memoization for vision calls.
 *
 * The key hashes the actual image bytes (plus label, MIME, task, prompt, and
 * token cap), not the source string, so a repeated `describe_image` on the
 * same content returns the cached answer instead of re-billing the vision API.
 */
export class VisionCache {
  private readonly map = new Map<string, VisionResult>();
  private readonly maxEntries: number;

  constructor(maxEntries = 200) {
    this.maxEntries = Math.max(0, Math.floor(maxEntries));
  }

  get enabled(): boolean {
    return this.maxEntries > 0;
  }

  key(request: VisionRequest): string {
    const hash = createHash("sha256");
    hash.update(
      JSON.stringify({
        task: request.task,
        maxTokens: request.maxTokens ?? 2048,
        prompt: request.prompt,
      }),
    );
    for (const image of request.images) {
      // NUL never appears in JSON output or base64, so it is unambiguous.
      hash.update(SEP + image.label + SEP + image.mimeType + SEP);
      hash.update(image.base64);
    }
    return hash.digest("hex");
  }

  get(key: string): VisionResult | undefined {
    const hit = this.map.get(key);
    if (!hit) return undefined;
    // Refresh recency so `get` behaves LRU-ish.
    this.map.delete(key);
    this.map.set(key, hit);
    return hit;
  }

  set(key: string, result: VisionResult): void {
    if (!this.enabled) return;
    this.map.delete(key);
    this.map.set(key, result);
    while (this.map.size > this.maxEntries) {
      const oldest = this.map.keys().next().value;
      if (oldest === undefined) break;
      this.map.delete(oldest);
    }
  }
}
