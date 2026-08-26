import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  fetchWithRetry,
  retryDelayMs,
  shouldRetryStatus,
} from "../build/http.js";
import { jsonResponse } from "./helpers.mjs";

describe("HTTP retry helper", () => {
  it("retries only 429 and 5xx", () => {
    assert.equal(shouldRetryStatus(429), true);
    assert.equal(shouldRetryStatus(500), true);
    assert.equal(shouldRetryStatus(503), true);
    assert.equal(shouldRetryStatus(400), false);
    assert.equal(shouldRetryStatus(404), false);
    assert.equal(shouldRetryStatus(200), false);
  });

  it("honors numeric Retry-After and HTTP dates", () => {
    const numeric = new Response(null, {
      status: 429,
      headers: { "retry-after": "2" },
    });
    assert.equal(retryDelayMs(numeric, 1, () => 0), 2000);

    const when = new Date(Date.now() + 1500).toUTCString();
    const dated = new Response(null, {
      status: 429,
      headers: { "retry-after": when },
    });
    const delay = retryDelayMs(dated, 1, () => 0);
    assert.ok(delay <= 1500);
    assert.ok(delay >= 0);
  });

  it("does not retry timeouts", async () => {
    let calls = 0;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (_url, init) => {
      calls += 1;
      const signal = init?.signal;
      return await new Promise((_, reject) => {
        const onAbort = () => {
          const error = new Error("aborted");
          error.name = "AbortError";
          reject(error);
        };
        if (signal?.aborted) onAbort();
        else signal?.addEventListener("abort", onAbort, { once: true });
      });
    };

    try {
      await assert.rejects(
        () =>
          fetchWithRetry(
            "https://example.com/v1",
            { method: "GET" },
            { timeoutMs: 20, maxAttempts: 3 },
          ),
        (error) => error instanceof Error && error.name === "AbortError",
      );
      assert.equal(calls, 1);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("retries 429 then returns success", async () => {
    let calls = 0;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => {
      calls += 1;
      if (calls === 1) {
        return jsonResponse({ error: "wait" }, 429, { "retry-after": "0" });
      }
      return jsonResponse({ ok: true });
    };
    try {
      const response = await fetchWithRetry(
        "https://example.com/v1",
        { method: "POST" },
        { timeoutMs: 5_000, maxAttempts: 3 },
      );
      assert.equal(response.status, 200);
      assert.equal(calls, 2);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
