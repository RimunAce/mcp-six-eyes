import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { formatVisionStatus } from "../build/status.js";
import { VERSION } from "../build/version.js";

describe("vision_status", () => {
  it("reports limits, roots, retry, and cache policy", () => {
    const text = formatVisionStatus(
      {
        provider: "openai",
        apiKey: "sk-test",
        model: "gpt-4o-mini",
        timeoutMs: 60_000,
        maxImageBytes: 1024,
        maxImages: 4,
        cacheMaxEntries: 200,
        blockPrivateUrls: true,
        allowedRootsIsDefault: true,
        maxImageEdge: 2048,
        retryMaxAttempts: 3,
      },
      { primary: "openai/gpt-4o-mini" },
    );

    assert.match(text, new RegExp(`mcp-six-eyes ${VERSION} is ready`));
    assert.match(text, /Allowed roots: cwd \+ temp \(default\)/);
    assert.match(text, /Private URL block: on/);
    assert.match(text, /Max image edge: 2048/);
    assert.match(text, /Retry: 3 attempts on 429\/5xx, honors Retry-After/);
    assert.match(text, /fallback results not cached/);
  });
});
